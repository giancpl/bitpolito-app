package it.bitpolito.hub;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
// Simulation entry point exists only in the explicitly labelled sandbox APK.
public class SandboxPushReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context,Intent intent){
    PendingResult pending=goAsync();new Thread(()->{try{
      new SecureStore(context).put("push","true");
      Alerts.deliver(context,intent.getStringExtra("request"),intent.getStringExtra("phase"),System.currentTimeMillis()/1000+30).get(8,java.util.concurrent.TimeUnit.SECONDS);
    }catch(Exception ignored){}finally{pending.finish();}}).start();
  }
}
