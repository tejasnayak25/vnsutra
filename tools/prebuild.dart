import 'dart:io';
import 'dart:convert';
import 'package:image/image.dart' as img;

String projectRoot() => Directory.current.path;

void main() async {
  final root = projectRoot();
  final srcIcon = '$root/assets/icon/icon.png';
  final winIcon = '$root/windows/runner/resources/app_icon.ico';
  final linuxIcon = '$root/linux/data/flutter_assets/assets/icon/icon.png';
  final cmakeLists = '$root/linux/CMakeLists.txt';
  final myAppCC = '$root/linux/my_application.cc';
  final pubspec = '$root/pubspec.yaml';
  final androidManifest = '$root/android/app/src/main/AndroidManifest.xml';
  final androidStrings = '$root/android/app/src/main/res/values/strings.xml';
  final macosPlist = '$root/macos/Runner/Info.plist';
  final iosPlist = '$root/ios/Runner/Info.plist';

  // --- ICON GENERATION ---
  if (File(srcIcon).existsSync()) {
    final image = img.decodeImage(File(srcIcon).readAsBytesSync());
    if (image != null) {
      // Save Windows .ico (only 256x256 for simplicity)
      File(winIcon).writeAsBytesSync(img.encodeIco(image));
      print('Windows icon saved to $winIcon');
      Directory(linuxIcon).parent.createSync(recursive: true);
      File(linuxIcon).writeAsBytesSync(img.encodePng(image));
      print('Linux icon saved to $linuxIcon');
    }
  } else {
    print('Source icon not found: $srcIcon');
  }
  print('For macOS, please use an online tool to generate AppIcon.appiconset and replace in macos/Runner/Assets.xcassets/AppIcon.appiconset/');

  // --- USER INPUT ---
  stdout.write('\n--- App Metadata Update ---\n');
  stdout.write('Enter app name: ');
  final name = stdin.readLineSync()!.trim();
  stdout.write('Enter app description: ');
  final description = stdin.readLineSync()!.trim();
  stdout.write('Enter application id (e.g. com.example.vnsutra): ');
  final appId = stdin.readLineSync()!.trim();

  // --- APP METADATA UPDATE ---
  updateWindowsMetadata(winIcon, name, description, root);
  updateLinuxCMakeLists(cmakeLists, name, appId);
  updateLinuxMyAppCC(myAppCC, name);
  updatePubspec(pubspec, name, description);
  updateAndroidManifest(androidManifest, name);
  updateAndroidStrings(androidStrings, name);
  updatePlist(macosPlist, name);
  updatePlist(iosPlist, name);

  print('\nDone!');
}

void updateWindowsMetadata(String rcPath, String name, String description, String root) {
  rcPath = '$root/windows/runner/Runner.rc';
  final file = File(rcPath);
  if (!file.existsSync()) {
    print('Windows metadata file not found: $rcPath');
    return;
  }
  final lines = file.readAsLinesSync();
  final out = lines.map((line) {
    if (line.trim().startsWith('VALUE "FileDescription",')) {
      return ' VALUE "FileDescription", "$description" "\\0" ';
    } else if (line.trim().startsWith('VALUE "ProductName",')) {
      return ' VALUE "ProductName", "$name" "\\0" ';
    } else if (line.trim().startsWith('VALUE "InternalName",')) {
      return ' VALUE "InternalName", "${name.replaceAll(' ', '').toLowerCase()}" "\\0" ';
    } else if (line.trim().startsWith('VALUE "OriginalFilename",')) {
      return ' VALUE "OriginalFilename", "${name.replaceAll(' ', '').toLowerCase()}.exe" "\\0" ';
    } else {
      return line;
    }
  }).join('\n');
  file.writeAsStringSync(out);
  print('Updated Windows metadata in $rcPath');
}

void updateLinuxCMakeLists(String cmakeLists, String name, String appId) {
  final file = File(cmakeLists);
  if (!file.existsSync()) {
    print('Linux CMakeLists.txt not found: $cmakeLists');
    return;
  }
  var content = file.readAsStringSync();
  content = content.replaceAll(RegExp(r'set\(BINARY_NAME ".*?"\)'), 'set(BINARY_NAME "$name")');
  content = content.replaceAll(RegExp(r'set\(APPLICATION_ID ".*?"\)'), 'set(APPLICATION_ID "$appId")');
  file.writeAsStringSync(content);
  print('Updated Linux CMakeLists.txt metadata');
}

void updateLinuxMyAppCC(String myAppCC, String name) {
  final file = File(myAppCC);
  if (!file.existsSync()) {
    print('Linux my_application.cc not found: $myAppCC');
    return;
  }
  final lines = file.readAsLinesSync();
  final out = lines.map((line) {
    if (line.contains('gtk_header_bar_set_title')) {
      return line.replaceAll(RegExp(r'gtk_header_bar_set_title\(header_bar, ".*?"\);'), 'gtk_header_bar_set_title(header_bar, "$name");');
    } else if (line.contains('gtk_window_set_title(')) {
      return line.replaceAll(RegExp(r'gtk_window_set_title\(window, ".*?"\);'), 'gtk_window_set_title(window, "$name");');
    } else {
      return line;
    }
  }).join('\n');
  file.writeAsStringSync(out);
  print('Updated Linux my_application.cc window title');
}

void updatePubspec(String pubspec, String name, String description) {
  final file = File(pubspec);
  if (!file.existsSync()) {
    print('pubspec.yaml not found!');
    return;
  }
  final lines = file.readAsLinesSync();
  final out = lines.map((line) {
    if (line.startsWith('name: ')) {
      return 'name: $name';
    } else if (line.startsWith('description: ')) {
      return 'description: "$description"';
    } else {
      return line;
    }
  }).join('\n');
  file.writeAsStringSync(out);
  print('Updated pubspec.yaml');
}

void updateAndroidManifest(String manifest, String name) {
  final file = File(manifest);
  if (!file.existsSync()) {
    print('AndroidManifest.xml not found: $manifest');
    return;
  }
  var content = file.readAsStringSync();
  content = content.replaceAll(RegExp(r'android:label="[^"]*"'), 'android:label="$name"');
  file.writeAsStringSync(content);
  print('Updated AndroidManifest.xml app label');
}

void updateAndroidStrings(String stringsPath, String name) {
  final file = File(stringsPath);
  if (!file.existsSync()) {
    // Create file if not exists
    final dir = file.parent;
    if (!dir.existsSync()) dir.createSync(recursive: true);
    file.writeAsStringSync('<resources>\n    <string name="app_name">$name</string>\n</resources>\n');
    print('Created Android strings.xml with app_name');
    return;
  }
  final lines = file.readAsLinesSync();
  var found = false;
  final out = lines.map((line) {
    if (line.contains('<string name="app_name">')) {
      found = true;
      return '    <string name="app_name">$name</string>';
    } else {
      return line;
    }
  }).toList();
  if (!found) {
    // Insert app_name if not found
    out.insert(out.length - 1, '    <string name="app_name">$name</string>');
  }
  file.writeAsStringSync(out.join('\n'));
  print('Updated Android strings.xml app_name');
}

void updatePlist(String plistPath, String name) {
  final file = File(plistPath);
  if (!file.existsSync()) {
    print('Plist not found: $plistPath');
    return;
  }
  var content = file.readAsStringSync();
  content = content.replaceAllMapped(
    RegExp(r'<key>(CFBundleName|CFBundleDisplayName)</key>\s*<string>.*?</string>'),
    (m) => '<key>${m[1]}</key>\n    <string>$name</string>'
  );
  file.writeAsStringSync(content);
  print('Updated $plistPath (CFBundleName, CFBundleDisplayName)');
}
