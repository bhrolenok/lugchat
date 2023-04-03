// LugChatClient.java
import java.util.*;
import java.net.*;
import java.io.*;
import javax.json.*;
import javax.json.stream.*;
import java.security.*;

public class LugChatClient {

	public static JsonObject makeMessage(JsonObject messageData, String privKey){
		String signature = "signed-with-"+privKey; //replace with actual signing code
		return Json.createObjectBuilder().add("message",messageData).add("sig",signature).build();
	}
	public static JsonObject makeMessageDataObject(String type, String nick, JsonObject content){
		return Json.createObjectBuilder()
			.add("type",type)
			.add("nick",nick)
			.add("timestamp",Long.toString(System.currentTimeMillis()))
			.add("content",content)
			.build();
	}
	public static JsonObject makeHelloMessage(String base64PubKey){
		return Json.createObjectBuilder().add("pub-key",base64PubKey).build();
	}
	public static String parseHelloResponse(JsonObject responseContent){
		return responseContent.getString("server-key");
	}
	public static JsonObject makeSubscribeMessage(){
		return Json.createObjectBuilder().build();
	}
	public static JsonObject makePostMessage(String postContent){
		return Json.createObjectBuilder().add("post-content",postContent).build();
	}
	public static JsonObject makeHistoryMessage(long startTime, long endTime){
		return Json.createObjectBuilder().add("start",startTime).add("end",endTime).build();
	}
	public static JsonArray parseHistoryResponse(JsonObject responseContent){
		return responseContent.getJsonArray("msg-list");
	}
	public static JsonObject makeReplyMessage(long postTime, String origSigBase64, String replyContent){
		return Json.createObjectBuilder()
			.add("post-time",postTime)
			.add("orig-sig",origSigBase64)
			.add("reply-content",replyContent)
			.build();
	}
	public static JsonObject makeDisconnectMessage(){
		return Json.createObjectBuilder().build();
	}

	public static boolean notStopping;

	public static void parseServerMessages(BufferedReader in, Vector<JsonObject> messageQueue){
		JsonObject latestMessage = null;
		while(notStopping){
			try{
				//what the actual fuck is with java networking
				//jesus. It was threading + scope. If a stream/reader object
				//goes out of scope it tries to close the underlying stream,
				//which makes it invalid for any other reader/stream built
				//on the same underlying I/O thing. This happens when you
				//hit the end of a try-with-resources block and you don't
				//join() the threads that access the objects created in the
				//parent thread. I bet that the JsonParser and JsonReader
				//will work now. Creation works at least.

				//reading directly appears not to work.
				// latestMessage = jread.readObject();
				//apparently, JsonReader objs should only be used from static sources,
				//because they throw exceptions if they've already called read().

				String line = in.readLine();
				latestMessage = Json.createReader(new StringReader(line)).readObject();
				System.out.println("Rx: '"+latestMessage+"'");
				messageQueue.add(latestMessage);
				synchronized(messageQueue){
					messageQueue.notify();
				}
				// JsonParser jp = Json.createParser(in);
				// System.out.println("Has next? "+jp.hasNext());
				//This is stupid. The Json parser/reader implementations are broken
				//and will not block for data. Even attempting to check .hasNext() will
				//throw a SocketException: Socket closed even when reading from the BufferedReader
				//underlying the JsonParser blocks correctly.
				// String line = in.readLine();
				// if(line == null){
				// 	System.out.println("read a null, killing client");
				// 	notStopping = true;
				// 	break;
				// }
				// Thread.sleep(0); //does sleeping for half a second kill it?
				// System.out.println("Time: "+System.currentTimeMillis());
				// System.out.println("Rx: '"+line+"'");
				// jread = Json.createReader(new StringReader(line));
				// latestMessage = jread.readObject();
				// messageQueue.add(latestMessage);
				// synchronized(messageQueue){
				// 	messageQueue.notify();
				// }
			} catch(Exception e){ throw new RuntimeException(e); }
		}
	}

	public static void processMessageQueue(Vector<JsonObject> messageQueue){
		while(notStopping){
			if(messageQueue.size()>0){
				//pop a message
				JsonObject message = messageQueue.remove(0);
				//figure out type
				String type = message.getJsonObject("message").getString("type");
				//run appropriate method
				System.out.println("Message:");
				System.out.println(message);
				System.out.println("---");
			} else {
				try{
					synchronized(messageQueue){
						messageQueue.wait(2000);						
					}
				} catch(InterruptedException ie){
					//timeout exception is OK, just loop around
				}
			}
		}
	}

	public static void processUserInput(Scanner scan, PrintWriter out, String nick){
		String userInput;
		JsonObject msg;
		while(notStopping){
			System.out.print(">");
			userInput = scan.nextLine();
			if(userInput.equalsIgnoreCase("disconnect.")){
				notStopping = false;
				msg = makeMessage(makeMessageDataObject("disconnect",nick,makeDisconnectMessage()),"client-private-key");
			} else{
				msg = makeMessage(makeMessageDataObject("post",nick,makePostMessage(userInput)),"client-private-key");
			}
			out.write(msg+"\n"); out.flush();
		}
	}

	public static void main(String[] args){
		try(
			Socket s = new Socket(args[0],Integer.parseInt(args[1]));
			PrintWriter out = new PrintWriter(s.getOutputStream(),true);
			BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream()));
			// InputStream in = s.getInputStream();
		) {
			Scanner scan = new Scanner(System.in);
			String termIn;
			notStopping = true;
			Vector<JsonObject> messageQueue = new Vector<JsonObject>();
			//start thread for parsing server messages
			Thread psmThread = new Thread(){ public void run(){ parseServerMessages(in,messageQueue); }};
			psmThread.start();
			//start thread for processing messages
			Thread pmqThread = new Thread(){ public void run(){ processMessageQueue(messageQueue); }};
			pmqThread.start();
			//start thread for handling user input
			Thread puiThread = new Thread(){ public void run(){ processUserInput(scan,out,args[2]); }};
			puiThread.start();
			psmThread.join();
			puiThread.join();
		} catch(Exception e){
			throw new RuntimeException(e);
		}
	}
}