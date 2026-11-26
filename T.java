import java.nio.file.*;
public class T {
  public static void main(String[] a) throws Exception {
    Path p = Paths.get("C:/Users/21660/.gradle/notifications/probe-" + System.getProperty("java.version"));
    Files.createDirectories(p);
    Files.writeString(p.resolve("x.txt"), "ok");
    System.out.println("OK " + p);
  }
}
