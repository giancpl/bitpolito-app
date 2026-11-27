package it.bitpolito.hub;

import android.content.Intent;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private String pendingRequest;

  private void applyLightSystemBars() {
    WindowInsetsControllerCompat insets =
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    if (insets != null) {
      insets.setAppearanceLightStatusBars(true);
      insets.setAppearanceLightNavigationBars(true);
    }
  }

  @Override
  public void onCreate(Bundle state) {
    AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
    registerPlugin(BitPolitoPlugin.class);
    registerPlugin(HubPlugin.class);
    super.onCreate(state);
    applyLightSystemBars();
    Alerts.channels(this);
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      public void handleOnBackPressed() {
        if (bridge != null) bridge.triggerWindowJSEvent("bitpolito:back", "{}");
      }
    });
  }

  @Override
  public void onResume() {
    super.onResume();
    applyLightSystemBars();
    Alerts.foreground = true;
    HubRuntime.get(this).setVisible(true);
    HubRuntime.get(this).startSync();
    if (bridge != null) {
      bridge.triggerWindowJSEvent("bitpolito:resume", "{}");
      deliverRequest();
    }
  }

  @Override
  public void onPause() {
    Alerts.foreground = false;
    HubRuntime.get(this).setVisible(false);
    HubRuntime.get(this).pauseWhenHidden();
    super.onPause();
  }

  @Override
  public void onDestroy() {
    HubRuntime.get(this).detach();
    super.onDestroy();
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    pendingRequest = intent.getStringExtra("request");
    deliverRequest();
  }

  /** Hands invitation deep links and notification taps to the WebView through protected storage. */
  private void deliverRequest() {
    if (getIntent() != null
        && getIntent().getData() != null
        && "bitpolito".equals(getIntent().getData().getScheme())
        && "join".equals(getIntent().getData().getHost())) {
      try {
        new SecureStore(this).put("launchInvite", getIntent().getData().toString());
      } catch (Exception ignored) {
      }
      getIntent().setData(null);
    }

    if (pendingRequest == null && getIntent() != null) {
      pendingRequest = getIntent().getStringExtra("request");
    }
    if (pendingRequest != null && bridge != null) {
      String id = pendingRequest;
      if (id.matches("[A-Za-z0-9_-]{1,80}")) {
        try {
          new SecureStore(this).put("launchRequest", id);
        } catch (Exception ignored) {
        }
        bridge.triggerWindowJSEvent("bitpolito:resume", "{}");
      }
      getIntent().removeExtra("request");
      pendingRequest = null;
    }
  }
}
