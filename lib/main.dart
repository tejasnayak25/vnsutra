// import 'dart:ui';
import 'dart:io';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_windows/webview_windows.dart';
import 'package:flutter/services.dart';
import 'package:window_manager/window_manager.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
    windowManager.ensureInitialized();
    windowManager.setFullScreen(true);
  } else {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'VN-Sutra',
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
      ),
      home: const SimpleWebView(url: 'https://vnsutra.vercel.app'),
    );
  }
}

class SimpleWebView extends StatefulWidget {
  final String url;
  const SimpleWebView({super.key, required this.url});

  @override
  State<SimpleWebView> createState() => _SimpleWebViewState();
}

class _SimpleWebViewState extends State<SimpleWebView> {
  WebviewController? _windowsController;
  WebViewController? _mobileController;
  bool _windowsWebViewReady = false;
  // Add a timer for polling the URL on Windows
  Timer? _closeCheckTimer;

  @override
  void initState() {
    super.initState();
    if (Platform.isWindows) {
      windowManager.addListener(_WindowCloseListener());
      _windowsController = WebviewController();
      _windowsController!.initialize().then((_) {
        // Inject JS API before loading the URL (use WebView2's postMessage)
        _windowsController!.addScriptToExecuteOnDocumentCreated(
          """
          window.closeApp = function() { if (window.chrome && window.chrome.webview) { window.chrome.webview.postMessage('closeApp'); } };
          """
        );
        _windowsController!.loadUrl(widget.url);
        setState(() {
          _windowsWebViewReady = true;
        });
        _windowsController!.webMessage.listen((message) async {
          if (message == 'closeApp') {
            print("closing");
            await windowManager.close();
            exit(0); // Ensure the process fully exits
          }
        });
      });
    } else {
      _mobileController = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(const Color(0xFF020617))
        ..addJavaScriptChannel('CloseApp', onMessageReceived: (msg) {
          SystemNavigator.pop();
        })
        ..setNavigationDelegate(NavigationDelegate(
          onPageFinished: (url) {
            _mobileController?.runJavaScript(
              "window.closeApp = function() { CloseApp.postMessage('closeApp'); }"
            );
          },
        ))
        ..loadRequest(Uri.parse(widget.url));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (Platform.isWindows) {
      if (!_windowsWebViewReady) {
        return const Scaffold(
          backgroundColor: Color(0xFF020617),
          body: Center(child: CircularProgressIndicator()),
        );
      }
      double _lastDragDy = 0;
      return Scaffold(
        body: Stack(
          children: [
            GestureDetector(
              onVerticalDragStart: (details) {
                _lastDragDy = details.localPosition.dy;
              },
              onVerticalDragUpdate: (details) {
                double delta = details.localPosition.dy - _lastDragDy;
                _lastDragDy = details.localPosition.dy;
                print(delta);
                _windowsController?.executeScript('window.scrollApp(${-delta});');
              },
              child: Listener(
                onPointerSignal: (signal) {
                  if (signal is PointerScrollEvent) {
                    print(signal.scrollDelta.dy);
                    _windowsController?.executeScript(
                      'window.scrollApp(${signal.scrollDelta.dy});'
                    );
                  }
                },
                child: Webview(_windowsController!),
              ),
            ),
          ],
        ),
      );
    } else {
      return WillPopScope(
        onWillPop: () async {
          SystemNavigator.pop();
          return false;
        },
        child: Scaffold(
          backgroundColor: Color(0xFF020617),
          body: Stack(
            children: [
              _mobileController != null
                  ? WebViewWidget(controller: _mobileController!)
                  : const Center(child: CircularProgressIndicator()),
            ],
          ),
        ),
      );
    }
  }

  @override
  void dispose() {
    if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
      windowManager.removeListener(_WindowCloseListener());
      windowManager.setFullScreen(false);
    } else {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    _closeCheckTimer?.cancel();
    _windowsController?.dispose();
    super.dispose();
  }
}

// Add a window close listener class
class _WindowCloseListener extends WindowListener {
  @override
  void onWindowClose() async {
    exit(0); // Ensure the process fully exits when window is closed manually
  }
}
