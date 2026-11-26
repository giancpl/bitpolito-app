package it.bitpolito.hub;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
// The event stream keeps its credential native, just like ordinary API calls.
final class NativeRealtime {
  private final MainActivity activity;
  private volatile HttpURLConnection connection;
  private Thread worker;
  NativeRealtime(MainActivity activity){this.activity=activity;}
  synchronized void start(){
    if(worker!=null&&worker.isAlive())return;
    worker=new Thread(()->{
      Thread self=Thread.currentThread();
      while(!self.isInterrupted()){
        HttpURLConnection stream=null;
        try{
          String token=new SecureStore(activity).get("session");
          if(token==null){Thread.sleep(2000);continue;}
          URI origin=URI.create(BuildConfig.API_ORIGIN);
          if(!"https".equals(origin.getScheme())&&!(BuildConfig.SANDBOX&&"127.0.0.1".equals(origin.getHost())))return;
          stream=(HttpURLConnection)origin.resolve("/api/realtime").toURL().openConnection();connection=stream;
          stream.setRequestProperty("Authorization","Bearer "+token);stream.setRequestProperty("Accept","text/event-stream");
          stream.setInstanceFollowRedirects(false);stream.setConnectTimeout(3000);stream.setReadTimeout(30000);
          if(stream.getResponseCode()==401){if(new SecureStore(activity).clearSessionIf(token)){Alerts.clear(activity);changed();}return;}
          if(stream.getResponseCode()!=200)throw new Exception("Realtime unavailable");
          try(BufferedReader reader=new BufferedReader(new InputStreamReader(stream.getInputStream(),java.nio.charset.StandardCharsets.UTF_8))){
            String line;while(!self.isInterrupted()&&(line=reader.readLine())!=null){
              if(line.equals("event: change"))changed();
              if(line.equals("event: revoked")){if(new SecureStore(activity).clearSessionIf(token)){Alerts.clear(activity);changed();}return;}
            }
          }
        }catch(InterruptedException done){return;}catch(Exception ignored){/* Five-second HTTP polling remains available. */}
        finally{if(stream!=null)stream.disconnect();if(connection==stream)connection=null;}
        try{Thread.sleep(2000);}catch(InterruptedException done){return;}
      }
    },"bitpolito-realtime");
    worker.setDaemon(true);worker.start();
  }
  private void changed(){activity.runOnUiThread(()->{if(activity.getBridge()!=null)activity.getBridge().triggerWindowJSEvent("bitpolito:realtime","{}");});}
  synchronized void stop(){if(worker!=null){worker.interrupt();worker=null;}HttpURLConnection active=connection;connection=null;if(active!=null){Thread abort=new Thread(active::disconnect,"bitpolito-realtime-stop");abort.setDaemon(true);abort.start();}}
}
