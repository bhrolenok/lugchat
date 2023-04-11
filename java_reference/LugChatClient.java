// LugChatClient.java
import java.util.*;
import java.net.*;
import java.io.*;
import javax.json.*;
import javax.json.stream.*;
import java.security.*;
import java.security.spec.*;

public class LugChatClient {

	public static JsonObject makeMessage(JsonObject messageData, Signature sig) throws SignatureException {
		// Signature sig = Signature.getInstance("SHA512withRSA");
		// sig.initSign(kpair.getPrivate());
		sig.update(messageData.toString().getBytes());
		String signature = Base64.getEncoder().encodeToString(sig.sign()); //"signed-with-"+privKey; //replace with actual signing code
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
				System.out.print("\n>");
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
		// System.out.println("Beginning processing message queue thread.");
		// System.out.print("\n>");
		PublicKey serverPubKey = null;
		while(notStopping){
			if(messageQueue.size()>0){
				if(serverPubKey == null){
					// System.out.println("No server key set. Checking messages for valid server key in hello response.");
					// System.out.print("\n>");
					for(int i=0;i<messageQueue.size();i++){
						JsonObject message = messageQueue.get(i);
						if(message.getJsonObject("message").getString("type").equalsIgnoreCase("response")){
							if(message.getJsonObject("message").getString("response-to").equalsIgnoreCase("hello")){
								//grab key data from message
								String encodedServerKey = message.getJsonObject("message").getJsonObject("content").getString("pub-key");
								//decode into key and save as serverPubKey
								try{
									KeyFactory kfac = KeyFactory.getInstance("RSA");
									serverPubKey = kfac.generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(encodedServerKey)));
									//delete message from messageQueue
									messageQueue.remove(i);
									//break the for loop
									break;
								} catch(Exception e){
									throw new RuntimeException("Error processing server public key", e);
								}
							}
						}
					}
					if(serverPubKey==null){
						//looked through all the messages, but didn't find a hello response, sleep
						//until we get a new message and try again.
						try{
							synchronized(messageQueue){
								messageQueue.wait(2000);
							}
						} catch(InterruptedException ie){
							//timeout exception is OK, will just loop around
						}
					}
				} else {
					// System.out.println("Server key found. Processing message.");
					// System.out.print("\n>");
					//pop a message
					JsonObject message = messageQueue.remove(0);
					//figure out type
					String type = message.getJsonObject("message").getString("type");
					//run appropriate method
					System.out.println("Message:");
					System.out.println(message);
					System.out.println("---");
					System.out.print("\n>");
				}
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

	public static void processMessageOutQueue(Vector<JsonObject> messageOutQueue, PrintWriter out){
		while(notStopping){
			if(messageOutQueue.size()>0){
				JsonObject message = messageOutQueue.remove(0);
				out.write(message+"\n"); out.flush();
				//if is a disconnect message, update notStopping for everyone
				if(message.getJsonObject("message").getString("type").equalsIgnoreCase("disconnect")){
					notStopping = false;
				}
			} else {
				try{
					synchronized(messageOutQueue){
						messageOutQueue.wait(2000);
					}
				} catch(InterruptedException ie){
					//timeout exception is OK, just loop around
				}
			}
		}
	}

	public static void processUserInput(Scanner scan, Vector<JsonObject> messageOutQueue, String nick, Signature sig){
		String userInput;
		JsonObject msg;
		while(notStopping){
			System.out.print(">");
			userInput = scan.nextLine();
			try{
				if(userInput.equalsIgnoreCase(".disconnect")){
					msg = makeMessage(makeMessageDataObject("disconnect",nick,makeDisconnectMessage()),sig);
				} else{
					msg = makeMessage(makeMessageDataObject("post",nick,makePostMessage(userInput)),sig);
				}
				messageOutQueue.add(msg);
			} catch(SignatureException se){
				throw new RuntimeException("Error signing messages", se);
			}
		}
	}

	public static void main(String[] args){
		try(
			Socket s = new Socket(args[0],Integer.parseInt(args[1]));
			PrintWriter out = new PrintWriter(s.getOutputStream(),true);
			BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream()));
			// InputStream in = s.getInputStream();
		) {
			//keys
			File pubFD = new File("key.pub"), privFD = new File("key.priv");
			KeyPair keypair;
			if(!(pubFD.exists()&&privFD.exists())){
				keypair = KeyPairGenerator.getInstance("RSA").generateKeyPair();
				//attempt to store keys
				FileWriter fw = new FileWriter(pubFD);
				fw.write(Base64.getEncoder().encodeToString(keypair.getPublic().getEncoded()));
				fw.close();
				fw = new FileWriter(privFD);
				fw.write(Base64.getEncoder().encodeToString(keypair.getPrivate().getEncoded()));
				fw.close();
			} else {
				KeyFactory kfac = KeyFactory.getInstance("RSA");
				keypair = new KeyPair(
					kfac.generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(new String(java.nio.file.Files.readAllBytes(pubFD.toPath()))))),
					kfac.generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(new String(java.nio.file.Files.readAllBytes(privFD.toPath())))))
				);
			}
			Signature sig = Signature.getInstance("SHA512withRSA");
			sig.initSign(keypair.getPrivate());
			//setup
			Scanner scan = new Scanner(System.in);
			String termIn;
			notStopping = true;
			Vector<JsonObject> messageQueue = new Vector<JsonObject>();
			Vector<JsonObject> messageOutQueue = new Vector<JsonObject>();
			//make hello message for the first thing in messageOutQueue
			JsonObject helloMsg = makeMessage(
				makeMessageDataObject(
					"hello", //type
					args[2], //nick
					makeHelloMessage(Base64.getEncoder().encodeToString(keypair.getPublic().getEncoded())) //content
				),
				sig);
			messageOutQueue.add(helloMsg);
			//start thread for parsing server messages
			Thread psmThread = new Thread(){ public void run(){ parseServerMessages(in,messageQueue); }};
			//start thread for handling user input
			Thread puiThread = new Thread(){ public void run(){ processUserInput(scan,messageOutQueue,args[2], sig); }};
			//start thread for processing INCOMING messages
			Thread pmqThread = new Thread(){ public void run(){ processMessageQueue(messageQueue); }};
			//start thread for processing OUTGOING messages
			Thread pmoqThread = new Thread(){ public void run(){ processMessageOutQueue(messageOutQueue,out); }};
			//join threads with shared reader/writer/stream objects
			psmThread.start();
			// pmqThread.start();
			pmoqThread.start();
			puiThread.start();
			psmThread.join();
			// pmqThread.join();
			puiThread.join();
			pmoqThread.join();
		} catch(Exception e){
			throw new RuntimeException(e);
		}
	}
}