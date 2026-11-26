package it.bitpolito.hub;
import org.junit.Test;
import static org.junit.Assert.*;
public class AlertPolicyTest {
  @Test public void onlyPendingUnexpiredRequestsRing(){assertTrue(AlertPolicy.waiting("waiting",200,100,"ring",90));assertFalse(AlertPolicy.waiting("claimed",200,100,"ring",90));assertFalse(AlertPolicy.waiting("resolved",200,100,"ring",90));assertFalse(AlertPolicy.waiting("waiting",100,100,"ring",90));}
  @Test public void reminderDoesNotReplayInitialSound(){assertFalse(AlertPolicy.waiting("waiting",300,160,"ring",100));assertTrue(AlertPolicy.waiting("waiting",300,160,"reminder",100));assertFalse(AlertPolicy.waiting("waiting",300,159,"reminder",100));assertFalse(AlertPolicy.waiting("waiting",300,160,"other",100));}
  @Test public void bridgeCannotEscapeConfiguredBackend(){for(String path:new String[]{"https://evil.example/api/me","//evil.example/api/me","/api/../me","/api/%2e%2e/me","/api/me#x","/api/me?url=https://evil.example","/api/\\evil"})assertFalse(path,AlertPolicy.safePath(path));assertTrue(AlertPolicy.safePath("/api/moo/state"));assertTrue(AlertPolicy.nativeLoginPath("/api/auth/android/session"));assertFalse(AlertPolicy.nativeLoginPath("/api/me"));}
}
