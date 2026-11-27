package it.bitpolito.hub;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import android.content.Context;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class SecureStoreInstrumentedTest {
  @Test public void keystoreEncryptsAndAuthenticatesPrivateState() throws Exception {
    Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();SecureStore store=new SecureStore(c);
    try {
      store.put("instrumented-vault","ncryptsec1-local-test");
      assertEquals("ncryptsec1-local-test",new SecureStore(c).get("instrumented-vault"));
      String encrypted=c.getSharedPreferences("protected-state",0).getString("instrumented-vault","");
      assertFalse(encrypted.contains("ncryptsec1-local-test"));
      byte[] raw=android.util.Base64.decode(encrypted,android.util.Base64.NO_WRAP);raw[raw.length-1]^=1;
      c.getSharedPreferences("protected-state",0).edit().putString("instrumented-vault",android.util.Base64.encodeToString(raw,android.util.Base64.NO_WRAP)).commit();
      try{store.get("instrumented-vault");fail("Tampered encrypted state must be rejected");}catch(javax.crypto.AEADBadTagException expected){}
    } finally {store.put("instrumented-vault",null);}
  }
  @Test public void doorbellChannelUsesLocalCowWithoutAlarmPrivileges() throws Exception {
    Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();Alerts.channels(c);
    android.app.NotificationManager nm=c.getSystemService(android.app.NotificationManager.class);
    assertNull("The retired doorbell channel must be removed",nm.getNotificationChannel("office-doorbell-v1"));
    android.app.NotificationChannel channel=nm.getNotificationChannel(Alerts.configuredChannel(c));
    assertEquals("Office doorbell",channel.getName());assertNotNull(channel.getSound());assertEquals("true".equals(new SecureStore(c).get("hub.vibration")),channel.shouldVibrate());assertEquals(android.media.AudioAttributes.USAGE_NOTIFICATION_EVENT,channel.getAudioAttributes().getUsage());
  }
}
