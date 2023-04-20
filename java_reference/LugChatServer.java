// LugChatServer.java
import java.util.*;
import java.util.logging.*;
import java.net.*;
import java.io.*;
import javax.json.*;
import java.security.*;
import java.security.spec.*;

public class LugChatServer {

	public static JsonObject makeMessage(JsonObject messageData, Signature sig) throws SignatureException{
		// String signature = "signed-with-"+privKey; //replace with actual signing code
		sig.update(messageData.toString().getBytes());
		String signature = Base64.getEncoder().encodeToString(sig.sign());
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

	public static void handleClientConnection(Socket s, Vector<JsonObject> history, KeyPair keypair) throws Exception{
		System.out.println("Client connected: "+s.getInetAddress()+":"+s.getPort());
		PrintWriter out = new PrintWriter(s.getOutputStream(), true);
		BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream()));
		String inLine, outLine;
		PublicKey clientPubKey = null;
		Signature clientVerifier =Signature.getInstance("SHA512withRSA");
		Signature serverSig = Signature.getInstance("SHA512withRSA");
		serverSig.initSign(keypair.getPrivate());
		while(true){
			inLine = in.readLine();
			if(inLine == null) break;
			System.out.println("Rx "+s.getInetAddress()+":"+s.getPort()+" says '"+inLine+"'");
			JsonObject jobj = Json.createReader(new StringReader(inLine)).readObject();
			if(clientPubKey == null && jobj.getJsonObject("message").getString("type").equalsIgnoreCase("hello")){
				System.out.println("Received first hello, storing key:");
				String encodedClientKey = jobj.getJsonObject("message").getJsonObject("content").getString("pub-key");
				KeyFactory kfac = KeyFactory.getInstance("RSA");
				clientPubKey = kfac.generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(encodedClientKey)));
				System.out.println(encodedClientKey);
				clientVerifier.initVerify(clientPubKey);
			}
			//verify signature
			clientVerifier.update(jobj.getJsonObject("message").toString().getBytes());
			boolean sigCheck = clientVerifier.verify(Base64.getDecoder().decode(jobj.getString("sig")));
			JsonObject response = null;
			if(sigCheck){
				System.out.println("Message verified.");
				switch(jobj.getJsonObject("message").getString("type")){
				case "hello":
					String encodedServerPubKey = Base64.getEncoder().encodeToString(keypair.getPublic().getEncoded());
					response = makeMessage( makeHelloResponse(encodedServerPubKey), serverSig);
					break;
				case "post":
					response = makeMessage( makeJsonResponseMessage("post",true,"none"), serverSig);
					break;
				case "disconnect":
					response = makeMessage(makeJsonResponseMessage("disconnect",true,"none"), serverSig);
					break;
				default:
					response = makeMessage(makeJsonResponseMessage(jobj.getJsonObject("message").getString("type"),false,"format"), serverSig);
				}
			} else {
				System.out.println("Message verification failed.");
				response = makeMessage(makeJsonResponseMessage(jobj.getJsonObject("message").getString("type"),false,"signature"), serverSig);
			}
			// history.add(inLine);
			out.write(response+"\n");
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

	public static boolean keepAcceptingConnections = true;
	public static void main(String[] args){
		int listenPort = Integer.parseInt(args[0]);
		Vector<JsonObject> messageHistory = new Vector<JsonObject>();
		//keys
		File pubFD = new File("server-pub.key"), privFD = new File("server-priv.key");
		KeyPair keypair;
		try{
			Logger.getLogger(LugChatServer.class.getName()).setUseParentHandlers(false);
			FileHandler logout = new FileHandler("lugchat-server.log",true);
			logout.setFormatter(new SimpleFormatter());
			Logger.getLogger(LugChatServer.class.getClass().getName()).addHandler(logout);

			if(!(pubFD.exists()&&privFD.exists())){
				keypair = KeyPairGenerator.getInstance("RSA").generateKeyPair();
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
		} catch(Exception e){ throw new RuntimeException("Error setting up keys.",e); }
		//main loop
		ArrayList<Thread> connections = new ArrayList<Thread>();
		try(ServerSocket servSock = new ServerSocket(listenPort); ){
			while(keepAcceptingConnections){
				Socket established = servSock.accept();
				Thread t = new Thread(){public void run(){ try{ handleClientConnection(established,messageHistory,keypair);} catch(Exception e){ throw new RuntimeException("Exception in handleClientConnection", e); } }};
				connections.add(t);
				t.start();
				// handleClientConnection(established,messageHistory,keypair);
			}
		} catch(Exception e){ throw new RuntimeException(e); }
		for(Thread t : connections){ 
			try{
				t.join();
			} catch(Exception e){
				throw new RuntimeException("Error waiting to join client connection thread.",e);
			}
		}
	}
}