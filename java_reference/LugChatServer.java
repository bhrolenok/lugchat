// LugChatServer.java
import java.util.*;
import java.net.*;
import java.io.*;
import javax.json.*;
import java.security.*;

public class LugChatServer {

	public static JsonObject makeMessage(JsonObject messageData, String privKey){
		String signature = "signed-with-"+privKey; //replace with actual signing code
		return Json.createObjectBuilder().add("message",messageData).add("sig",signature).build();
	}
	public static JsonObject makeJsonResponseMessage(String origMsgType, boolean accept, String reason, JsonObject content){
		return Json.createObjectBuilder()
			.add("type","response")
			.add("response-to",origMsgType)
			.add("response",(accept)?"accept":"reject")
			.add("reason",reason)
			.add("time",Long.toString(System.currentTimeMillis()))
			.add("content",content)
			.build();
	}
	public static JsonObject makeJsonResponseMessage(String origMsgType, boolean accept, String reason){
		return makeJsonResponseMessage(origMsgType,accept,reason,Json.createObjectBuilder().build());
	}

	public static JsonObject makeHelloResponse(String base64ServerPubKey){
		return makeJsonResponseMessage("hello",true,"none",Json.createObjectBuilder().add("server-key",base64ServerPubKey).build());
	}

	public static JsonObject makeHistoryResponse(Vector<JsonObject> messageHistory,long startTime, long endTime){
		JsonArrayBuilder jab = Json.createArrayBuilder();
		for(JsonObject msg : messageHistory){
			long msgTime = Long.parseLong(msg.getJsonObject("message").getString("time"));
			if(msgTime >= startTime && msgTime<=endTime){
				jab.add(msg);
			}
		}
		return makeJsonResponseMessage("history",true,"none",Json.createObjectBuilder().add("msg-list",jab.build()).build());
	}

	public static void handleClientConnection(Socket s, Vector<JsonObject> history) throws Exception{
		System.out.println("Client connected: "+s.getInetAddress()+":"+s.getPort());
		PrintWriter out = new PrintWriter(s.getOutputStream(), true);
		BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream()));
		String inLine, outLine;
		while(true){
			inLine = in.readLine();
			if(inLine == null) break;
			System.out.println("Rx "+s.getInetAddress()+":"+s.getPort()+" says '"+inLine+"'");
			JsonObject jobj = Json.createReader(new StringReader(inLine)).readObject();
			// history.add(inLine);
			out.write(makeMessage(makeJsonResponseMessage("tmp",true,"none"),"server-priv-key")+"\n");
			// out.write("test.\n");
			out.flush();
		}
		System.out.println("Closing connection: "+s.getInetAddress()+":"+s.getPort());
		System.out.println("Time: "+System.currentTimeMillis());
		// out.write("Bye.");
		// out.flush();
		s.close();
		System.out.println("Connection closed");
	}
	public static void main(String[] args){
		int listenPort = Integer.parseInt(args[0]);
		Vector<JsonObject> messageHistory = new Vector<JsonObject>();
		while(true){
			try(
				ServerSocket servSock = new ServerSocket(listenPort);
				Socket established = servSock.accept();
			){
				handleClientConnection(established,messageHistory);
			} catch(Exception e){
				throw new RuntimeException(e);
			}			
		}
	}
}