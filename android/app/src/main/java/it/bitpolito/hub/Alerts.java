package it.bitpolito.hub;
import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
final class Alerts {
  static final ExecutorService executor=Executors.newSingleThreadExecutor();
  static volatile boolean foreground=false;
  private static MediaPlayer activePlayer;
  static final String CHANNEL="office-doorbell-v1", QUIET="office-status-v1";
  static boolean permission(Context c){return androidx.core.app.NotificationManagerCompat.from(c).areNotificationsEnabled()&&(Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(c,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED);}
  static void channels(Context c){
    NotificationManager nm=c.getSystemService(NotificationManager.class);
    AudioAttributes audio=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
    NotificationChannel channel=new NotificationChannel(CHANNEL,"Office doorbell",NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Door requests while you are in the office");channel.setSound(Uri.parse("android.resource://"+c.getPackageName()+"/"+R.raw.office_cow),audio);channel.enableVibration(true);channel.setVibrationPattern(new long[]{0,120,80,120});nm.createNotificationChannel(channel);
    NotificationChannel quiet=new NotificationChannel(QUIET,"Request updates",NotificationManager.IMPORTANCE_LOW);quiet.setSound(null,null);quiet.enableVibration(false);nm.createNotificationChannel(quiet);
  }
  static String configuredChannel(Context c){
    boolean vibration=false;try{vibration="true".equals(new SecureStore(c).get("hub.vibration"));}catch(Exception ignored){}
    String id=vibration?"office-doorbell-marmot-vibration-v1":"office-doorbell-marmot-sound-v1";
    NotificationChannel channel=new NotificationChannel(id,"Office doorbell",NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Encrypted door requests while you are in the office");
    channel.setSound(Uri.parse("android.resource://"+c.getPackageName()+"/"+R.raw.office_cow),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
    channel.enableVibration(vibration);if(vibration)channel.setVibrationPattern(new long[]{0,120,80,120});
    c.getSystemService(NotificationManager.class).createNotificationChannel(channel);return id;
  }
  static synchronized void clear(Context c){c.getSystemService(NotificationManager.class).cancelAll();if(activePlayer!=null){activePlayer.release();activePlayer=null;}Vibrator v=(Vibrator)c.getSystemService(Context.VIBRATOR_SERVICE);if(v!=null)v.cancel();}
  private static synchronized void finish(MediaPlayer player){if(activePlayer==player)activePlayer=null;player.release();}
  static synchronized void test(Context c){
    if(activePlayer!=null){activePlayer.release();activePlayer=null;}
    MediaPlayer player=MediaPlayer.create(c,R.raw.office_cow);if(player==null)throw new IllegalStateException("Cow sound unavailable. Try again or check Android settings.");activePlayer=player;if(player!=null){player.setOnCompletionListener(Alerts::finish);player.setOnErrorListener((p,a,b)->{finish(p);return true;});player.start();}
    boolean enabled=false;try{enabled="true".equals(new SecureStore(c).get("hub.vibration"));}catch(Exception ignored){}
    Vibrator vibrator=(Vibrator)c.getSystemService(Context.VIBRATOR_SERVICE);if(enabled&&vibrator!=null&&vibrator.hasVibrator())vibrator.vibrate(VibrationEffect.createOneShot(120,VibrationEffect.DEFAULT_AMPLITUDE));
  }
}
