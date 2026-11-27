package it.bitpolito.hub;
import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
final class SecureStore {
  private final SharedPreferences prefs;
  SecureStore(Context context){prefs=context.getSharedPreferences("protected-state",Context.MODE_PRIVATE);}
  private SecretKey key() throws Exception {
    KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
    if(!ks.containsAlias("bitpolito-storage")){
      KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
      gen.init(new KeyGenParameterSpec.Builder("bitpolito-storage",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());gen.generateKey();
    }
    return ((KeyStore.SecretKeyEntry)ks.getEntry("bitpolito-storage",null)).getSecretKey();
  }
  String get(String name) throws Exception { synchronized(SecureStore.class) {
    String raw=prefs.getString(name,null);if(raw==null)return null;
    byte[] value=Base64.decode(raw,Base64.NO_WRAP);ByteBuffer b=ByteBuffer.wrap(value);int n=b.getInt();if(n!=12)throw new Exception("Invalid protected state");byte[] iv=new byte[n];b.get(iv);byte[] data=new byte[b.remaining()];b.get(data);
    Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,iv));c.updateAAD(name.getBytes(StandardCharsets.UTF_8));return new String(c.doFinal(data),StandardCharsets.UTF_8);
  }
  }
  void put(String name,String value) throws Exception { synchronized(SecureStore.class) {
    if(value==null){prefs.edit().remove(name).commit();return;}
    Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());c.updateAAD(name.getBytes(StandardCharsets.UTF_8));byte[] data=c.doFinal(value.getBytes(StandardCharsets.UTF_8)),iv=c.getIV();
    prefs.edit().putString(name,Base64.encodeToString(ByteBuffer.allocate(4+iv.length+data.length).putInt(iv.length).put(iv).put(data).array(),Base64.NO_WRAP)).commit();
  }
  }
}
