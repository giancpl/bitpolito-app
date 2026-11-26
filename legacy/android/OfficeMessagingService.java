package it.bitpolito.hub;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
public class OfficeMessagingService extends FirebaseMessagingService {
  @Override public void onMessageReceived(RemoteMessage message){
    Map<String,String> d=message.getData();
    try{Alerts.deliver(this,d.getOrDefault("request",""),d.getOrDefault("phase",""),Long.parseLong(d.getOrDefault("expiresAt","0"))).get(8,java.util.concurrent.TimeUnit.SECONDS);}catch(Exception ignored){}
  }
  static void retryRegistration(android.content.Context context){Alerts.executor.execute(()->{
    try{
      SecureStore store=new SecureStore(context);
      String token=store.get("fcmToken"),installation=store.get("installation");
      if(token!=null&&installation!=null&&store.get("session")!=null&&"true".equals(store.get("push"))&&Alerts.permission(context))
        ApiClient.call(context,"/api/push/android/devices","POST",new org.json.JSONObject().put("installationId",installation).put("token",token).toString(),null);
    }catch(Exception ignored){/* Resume retries a refresh that failed while offline. */}
  });}
  @Override public void onNewToken(String token){
    try{new SecureStore(this).put("fcmToken",token);}catch(Exception ignored){}
    retryRegistration(this);
  }
}
