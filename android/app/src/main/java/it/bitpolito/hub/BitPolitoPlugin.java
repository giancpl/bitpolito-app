package it.bitpolito.hub;
import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.Callable;
@CapacitorPlugin(name="BitPolito",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class BitPolitoPlugin extends Plugin {
  private SecureStore store(){return new SecureStore(getContext());}
  private void work(PluginCall call,Callable<JSObject> fn){Alerts.executor.execute(()->{try{call.resolve(fn.call());}catch(Exception e){call.reject(e.getMessage()==null?"Android operation failed":e.getMessage());}});}
  @PluginMethod public void configuration(PluginCall call){JSObject o=new JSObject();o.put("origin","");o.put("transport","marmot");o.put("sandbox",BuildConfig.SANDBOX);o.put("firebase",false);call.resolve(o);}
  @PluginMethod public void request(PluginCall call){call.reject("The application backend has been retired. Use the encrypted hub.");}
  @PluginMethod public void authenticate(PluginCall call){call.reject("HTTP sessions have been retired. Connect your Nostr identity to the hub.");}
  @PluginMethod public void logout(PluginCall call){work(call,()->{store().put("session",null);store().put("user",null);Alerts.clear(getContext());return new JSObject();});}
  @PluginMethod public void vaultRead(PluginCall call){work(call,()->new JSObject().put("value",store().get("vault")));}
  @PluginMethod public void vaultWrite(PluginCall call){work(call,()->{String raw=call.getString("value","");JSONObject r=new JSONObject(raw);if(raw.length()>4096||!r.getString("encrypted").startsWith("ncryptsec1")||!r.getString("pubkey").matches("[a-f0-9]{64}"))throw new Exception("Invalid encrypted identity");store().put("vault",raw);return new JSObject();});}
  @PluginMethod public void vaultRemove(PluginCall call){work(call,()->{store().put("vault",null);return new JSObject();});}
  @PluginMethod public void exportBackup(PluginCall call){
    String content=call.getString("content","");if(!content.startsWith("ncryptsec1")||content.length()>512){call.reject("Invalid encrypted backup");return;}
    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/octet-stream").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,call.getString("name","bitpolito.ncryptsec"));
    startActivityForResult(call,intent,"backupSaved");
  }
  @ActivityCallback private void backupSaved(PluginCall call,ActivityResult result){
    if(call==null)return;if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){call.reject("Backup save cancelled. Choose a location to save your backup.");return;}
    work(call,()->{try(OutputStream out=getContext().getContentResolver().openOutputStream(result.getData().getData(),"wt")){if(out==null)throw new Exception("Cannot write the backup");out.write(call.getString("content","").getBytes(StandardCharsets.UTF_8));out.flush();}return new JSObject();});
  }
  private static String readBackup(InputStream in) throws Exception {if(in==null)throw new Exception("Could not read the selected backup");java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] chunk=new byte[128];int count;while((count=in.read(chunk))!=-1){if(out.size()+count>512)throw new Exception("Choose a valid encrypted backup");out.write(chunk,0,count);}return new String(out.toByteArray(),StandardCharsets.UTF_8);}
  @PluginMethod public void importBackup(PluginCall call){startActivityForResult(call,new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),"backupSelected");}
  @ActivityCallback private void backupSelected(PluginCall call,ActivityResult result){
    if(call==null)return;if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){call.reject("Backup selection cancelled");return;}
    work(call,()->{try(InputStream in=getContext().getContentResolver().openInputStream(result.getData().getData())){String content=readBackup(in).trim();if(!content.startsWith("ncryptsec1"))throw new Exception("Choose an encrypted NIP-49 backup");return new JSObject().put("content",content);}});
  }
  @PluginMethod public void signerKey(PluginCall call){
    Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("nostrsigner:")).putExtra("type","get_public_key").putExtra("permissions","[{\"type\":\"sign_event\",\"kind\":30443},{\"type\":\"sign_event\",\"kind\":450},{\"type\":\"sign_event\",\"kind\":30078},{\"type\":\"nip44_encrypt\"},{\"type\":\"nip44_decrypt\"}]");
    try{startActivityForResult(call,intent,"signerConnected");}catch(Exception e){call.reject("No Android Nostr signer found. Install a NIP-55 signer or create an identity here.");}
  }
  @ActivityCallback private void signerConnected(PluginCall call,ActivityResult result){
    if(call==null)return;Intent data=result.getData();if(result.getResultCode()!=Activity.RESULT_OK||data==null||data.getBooleanExtra("rejected",false)){call.reject("Signer connection cancelled");return;}
    String key=data.getStringExtra("result"),pkg=data.getStringExtra("package");if(key==null)key=data.getStringExtra("signature");
    try{if(key==null||!key.matches("[a-f0-9]{64}")||pkg==null||pkg.isEmpty())throw new Exception("Signer returned an invalid identity");store().put("signerPackage",pkg);store().put("signerKey",key);call.resolve(new JSObject().put("pubkey",key));}catch(Exception e){call.reject(e.getMessage());}
  }
  @PluginMethod public void signerSign(PluginCall call){
    try{
      String pkg=store().get("signerPackage"),key=store().get("signerKey");if(pkg==null||key==null)throw new Exception("Connect your Android signer first");
      JSONObject event=new JSONObject(call.getString("event","{}"));if(!java.util.Arrays.asList(27235,10002,10050,30443,450,30078,1059,22242,5).contains(event.optInt("kind"))||!key.equals(event.optString("pubkey")))throw new Exception("Unexpected signing request");
      Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("nostrsigner:"+Uri.encode(event.toString()))).setPackage(pkg).putExtra("type","sign_event").putExtra("current_user",key).putExtra("returnType","event");
      startActivityForResult(call,intent,"eventSigned");
    }catch(Exception e){call.reject(e.getMessage());}
  }
  @ActivityCallback private void eventSigned(PluginCall call,ActivityResult result){
    if(call==null)return;Intent data=result.getData();if(result.getResultCode()!=Activity.RESULT_OK||data==null||data.getBooleanExtra("rejected",false)){call.reject("Signing cancelled");return;}
    try{String raw=data.getStringExtra("event");if(raw==null)raw=data.getStringExtra("result");if(raw==null||!raw.trim().startsWith("{")){String signature=raw!=null?raw:data.getStringExtra("signature");JSONObject event=new JSONObject(call.getString("event","{}"));event.put("sig",signature);raw=event.toString();}call.resolve(new JSObject().put("event",raw));}catch(Exception e){call.reject("Signer returned an invalid event");}
  }
  @PluginMethod public void signerCrypt(PluginCall call){
    try{String pkg=store().get("signerPackage"),key=store().get("signerKey"),type=call.getString("type","");
      if(pkg==null||key==null)throw new Exception("Connect your Android signer first");
      if(!java.util.Arrays.asList("nip44_encrypt","nip44_decrypt").contains(type))throw new Exception("Unsupported encryption operation");
      String peer=call.getString("pubkey","");if(!peer.matches("[a-f0-9]{64}"))throw new Exception("Invalid encryption peer");
      Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("nostrsigner:"+Uri.encode(call.getString("content","")))).setPackage(pkg).putExtra("type",type).putExtra("current_user",key).putExtra("pubKey",peer);
      startActivityForResult(call,intent,"encryptedResult");
    }catch(Exception e){call.reject(e.getMessage());}
  }
  @ActivityCallback private void encryptedResult(PluginCall call,ActivityResult result){
    if(call==null)return;Intent data=result.getData();if(result.getResultCode()!=Activity.RESULT_OK||data==null||data.getBooleanExtra("rejected",false)){call.reject("Encryption request cancelled");return;}
    String value=data.getStringExtra("result");if(value==null){call.reject("Signer returned no encryption result");return;}call.resolve(new JSObject().put("content",value));
  }
  @PluginMethod public void alertsStatus(PluginCall call){work(call,()->new JSObject().put("permission",Alerts.permission(getContext())).put("firebase",false).put("enabled","true".equals(store().get("hub.alerts"))).put("vibration","true".equals(store().get("hub.vibration"))).put("listening",HubOfficeService.Companion.getRunning()));}
  @PluginMethod public void enableAlerts(PluginCall call){
    if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){requestPermissionForAlias("notifications",call,"notificationsGranted");return;}enable(call);
  }
  @PermissionCallback private void notificationsGranted(PluginCall call){if(getPermissionState("notifications")!=PermissionState.GRANTED){call.reject("Notifications were not allowed. You can enable them in Android settings.");return;}enable(call);}
  private void enable(PluginCall call){work(call,()->{store().put("hub.alerts","true");getActivity().runOnUiThread(()->HubOfficeService.Companion.start(getContext()));return new JSObject().put("enabled",true);});}
  @PluginMethod public void disableAlerts(PluginCall call){work(call,()->{store().put("hub.alerts","false");HubOfficeService.Companion.stop(getContext());return new JSObject();});}
  @PluginMethod public void testSound(PluginCall call){try{Alerts.test(getContext());call.resolve();}catch(Exception e){call.reject(e.getMessage());}}
  @PluginMethod public void alert(PluginCall call){call.reject("Office alerts are coordinated by the native encrypted listener");}
  @PluginMethod public void settings(PluginCall call){getActivity().startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getContext().getPackageName()));call.resolve();}
  @PluginMethod public void openExternal(PluginCall call){try{Uri uri=Uri.parse(call.getString("url",""));if(!java.util.Arrays.asList("https","http","nostrconnect","bunker").contains(uri.getScheme()))throw new Exception("Unsupported link");getActivity().startActivity(new Intent(Intent.ACTION_VIEW,uri));call.resolve();}catch(Exception e){call.reject("No app could open this link");}}
  @PluginMethod public void consumeRequest(PluginCall call){work(call,()->{String request=store().get("launchRequest");store().put("launchRequest",null);String invite=store().get("launchInvite");store().put("launchInvite",null);return new JSObject().put("request",request).put("invite",invite);});}
  @PluginMethod public void background(PluginCall call){getActivity().moveTaskToBack(true);call.resolve();}
}
