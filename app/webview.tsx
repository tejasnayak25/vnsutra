// webview.tsx
import { useFocusEffect } from 'expo-router'; // Or from @react-navigation/native
import React, { useCallback, useRef } from 'react';
import { Alert, BackHandler, StyleSheet, View } from 'react-native';
import type { WebViewNavigation } from 'react-native-webview'; // For typing navState
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export default function WebViewScreen() {
  const websiteUrl = 'https://vnsutra.vercel.app'; // Replace with your website's URL
  const webViewRef = useRef<WebView>(null);
  const canGoBackInWebView = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBackPress = () => {
        if (webViewRef.current && canGoBackInWebView.current && webViewRef.current.goBack) {
          webViewRef.current.goBack();
          return true; // Prevent default back action (exit app)
        }
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);

      return () => backHandler.remove();
    }, []) // Empty dependency array means this effect runs once on focus and cleans up on blur
  );

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    canGoBackInWebView.current = navState.canGoBack;
  };

  const onMessageFromWebView = (event: WebViewMessageEvent) => {
    const message = event.nativeEvent.data;
    if (message === 'close-app') {
      // Web page requested to close the app
      Alert.alert("Exit App", "The game wants to close. Exit?", [
        { text: "Cancel", onPress: () => null, style: "cancel" },
        { text: "YES", onPress: () => BackHandler.exitApp() }
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: websiteUrl }}
        style={styles.webview}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={onMessageFromWebView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, // Added a default bg color
  webview: { flex: 1 },
});
