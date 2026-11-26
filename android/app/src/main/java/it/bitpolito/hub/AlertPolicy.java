package it.bitpolito.hub;
final class AlertPolicy {
  static boolean waiting(String status,long expires,long now,String phase,long created){return "waiting".equals(status)&&expires>now&&("ring".equals(phase)?now-created<60:"reminder".equals(phase)&&now-created>=60);}
  static boolean safePath(String path){return path!=null&&path.startsWith("/api/")&&!path.contains("..")&&!path.contains("\\")&&!path.contains("#")&&!path.contains("%")&&!path.contains("?");}
  static boolean nativeLoginPath(String path){return "/api/auth/android/session".equals(path)||"/api/auth/session".equals(path);}
}
