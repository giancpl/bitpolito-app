package it.bitpolito.hub;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class Alerts {
  static final ExecutorService executor = Executors.newSingleThreadExecutor();
  static volatile boolean foreground = false;
  private static MediaPlayer activePlayer;

  /** Low-importance channel for the ongoing foreground-service notification. */
  static final String QUIET = "office-status-v1";

  /** Retired doorbell channel; superseded by the per-preference channels in {@link #configuredChannel}. */
  private static final String LEGACY_DOORBELL = "office-doorbell-v1";
  private static final String DOORBELL_SOUND = "office-doorbell-marmot-sound-v1";
  private static final String DOORBELL_VIBRATION = "office-doorbell-marmot-vibration-v1";

  private Alerts() {}

  static boolean permission(Context c) {
    return NotificationManagerCompat.from(c).areNotificationsEnabled()
        && (Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED);
  }

  static void channels(Context c) {
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    // Upgraded installs may still carry the retired doorbell channel. Nothing posts to it anymore.
    nm.deleteNotificationChannel(LEGACY_DOORBELL);
    NotificationChannel quiet =
        new NotificationChannel(QUIET, "Request updates", NotificationManager.IMPORTANCE_LOW);
    quiet.setSound(null, null);
    quiet.enableVibration(false);
    nm.createNotificationChannel(quiet);
  }

  /**
   * Returns the doorbell channel matching the user's vibration preference, creating it if needed.
   * Channel sound/vibration cannot be changed after creation, so each preference has its own id.
   */
  static String configuredChannel(Context c) {
    boolean vibration = false;
    try {
      vibration = "true".equals(new SecureStore(c).get("hub.vibration"));
    } catch (Exception ignored) {
    }
    String id = vibration ? DOORBELL_VIBRATION : DOORBELL_SOUND;
    NotificationChannel channel =
        new NotificationChannel(id, "Office doorbell", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Encrypted door requests while you are in the office");
    channel.setSound(
        Uri.parse("android.resource://" + c.getPackageName() + "/" + R.raw.office_cow),
        new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
    channel.enableVibration(vibration);
    if (vibration) channel.setVibrationPattern(new long[] {0, 120, 80, 120});
    c.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    return id;
  }

  static synchronized void clear(Context c) {
    c.getSystemService(NotificationManager.class).cancelAll();
    if (activePlayer != null) {
      activePlayer.release();
      activePlayer = null;
    }
    Vibrator v = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
    if (v != null) v.cancel();
  }

  private static synchronized void finish(MediaPlayer player) {
    if (activePlayer == player) activePlayer = null;
    player.release();
  }

  static synchronized void test(Context c) {
    if (activePlayer != null) {
      activePlayer.release();
      activePlayer = null;
    }
    MediaPlayer player = MediaPlayer.create(c, R.raw.office_cow);
    if (player == null) {
      throw new IllegalStateException("Cow sound unavailable. Try again or check Android settings.");
    }
    activePlayer = player;
    player.setOnCompletionListener(Alerts::finish);
    player.setOnErrorListener((p, what, extra) -> {
      finish(p);
      return true;
    });
    player.start();

    boolean enabled = false;
    try {
      enabled = "true".equals(new SecureStore(c).get("hub.vibration"));
    } catch (Exception ignored) {
    }
    Vibrator vibrator = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
    if (enabled && vibrator != null && vibrator.hasVibrator()) {
      vibrator.vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE));
    }
  }
}
