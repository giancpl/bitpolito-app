package it.bitpolito.hub;
import android.content.Context;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
final class ApiClient {
  static final class Result {
    final int status;final String body;
    Result(int s,String b){status=s;body=b;}
    JSONObject json() throws Exception{return new JSONObject(body);}
  }
  static String read(java.io.InputStream in,int limit) throws Exception {
    if(in==null)throw new Exception("Cannot read file");
    java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
    while((n=in.read(buffer))!=-1){if(out.size()+n>limit)throw new Exception("File or response is too large");out.write(buffer,0,n);}return out.toString("UTF-8");
  }
  static Result call(Context context,String path,String method,String body,String authorization) throws Exception {
    if(!AlertPolicy.safePath(path))throw new Exception("Invalid API path");
    URI base=URI.create(BuildConfig.API_ORIGIN),uri=base.resolve(path);
    if(!base.getAuthority().equals(uri.getAuthority())||!base.getScheme().equals(uri.getScheme()))throw new Exception("Untrusted API origin");
    if(!"https".equals(base.getScheme())&&!(BuildConfig.SANDBOX&&"127.0.0.1".equals(base.getHost())))throw new Exception("HTTPS is required");
    if(body==null&&(method.equals("POST")||method.equals("PUT")))body="{}";
    HttpURLConnection c=(HttpURLConnection)new URL(uri.toString()).openConnection();
    c.setInstanceFollowRedirects(false);c.setConnectTimeout(3000);c.setReadTimeout(4000);c.setRequestMethod(method);c.setRequestProperty("X-Bitpolito-Request","1");if(body!=null)c.setRequestProperty("Content-Type","application/json");
    String token=new SecureStore(context).get("session");
    if(authorization!=null)c.setRequestProperty("Authorization",authorization);else if(token!=null)c.setRequestProperty("Authorization","Bearer "+token);
    try{
      if(body!=null){c.setDoOutput(true);c.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));}
      int status=c.getResponseCode();java.io.InputStream in=status>=400?c.getErrorStream():c.getInputStream();
      String text=in==null?"{}":read(in,1048576);
      if(status==401&&authorization==null&&new SecureStore(context).clearSessionIf(token))Alerts.clear(context);
      return new Result(status,text);
    }finally{c.disconnect();}
  }
}
