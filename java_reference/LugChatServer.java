// LugChatServer.java
import java.util.*;
import java.util.logging.*;
import java.net.*;
import java.io.*;
import javax.json.*;
import java.security.*;
import java.security.spec.*;

public class LugChatServer {

	public static void handleClientConnection(Socket s, Vector<LugChatMessage> history, KeyPair keypair, Vector<PrintWriter> subscribers, Vector<LugChatMessage> relayQueue) throws Exception{
		System.out.println("Client connected: "+s.getInetAddress()+":"+s.getPort());
		PrintWriter out = new PrintWriter(s.getOutputStream(), true);
		subscribers.add(out);
		BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream()));
		String inLine, outLine;
		PublicKey clientPubKey = null;
		String clientPubKeyEncoded = null;

		while(true){
			inLine = in.readLine();
			if(inLine == null) break;
			System.out.println("Rx "+s.getInetAddress()+":"+s.getPort()+" says '"+inLine+"'");
			LugChatMessage lcm = new LugChatMessage(inLine);

			if(clientPubKeyEncoded == null && lcm.getType()==LugChatMessage.Types.HELLO){
				System.out.println("Received first hello, storing key:");
				clientPubKeyEncoded = lcm.getHelloPublicKey();
			}
			//verify signature
			boolean sigCheck = lcm.sigVerified(clientPubKeyEncoded);
			// JsonObject response = null; //TODO: replace all JsonObjects with LugChatMessages
			LugChatMessage lcmResponse = null;
			if(sigCheck){
				System.out.println("Message verified.");
				switch(lcm.getType()){
				case HELLO:
					lcmResponse = LugChatMessage.makeHelloResponseMessage(lcm.getSignature(),keypair);
					break;
				case POST:
					System.out.println("Post message received");
					lcmResponse = LugChatMessage.makePostResponseMessage(lcm.getSignature(),keypair);
					relayQueue.add(lcm);
					synchronized(relayQueue){
						relayQueue.notify();
					}
					break;
				case DISCONNECT:
					lcmResponse = LugChatMessage.makeDisconnectResponseMessage(lcm.getSignature(),keypair);
					break;
				default:
					lcmResponse = LugChatMessage.makeRejectResponseMessage(lcm.getType(),lcm.getSignature(),LugChatMessage.Reasons.FORMAT,keypair);
				}
			} else {
				System.out.println("Message verification failed.");
				lcmResponse = LugChatMessage.makeRejectResponseMessage(lcm.getType(), lcm.getSignature(), LugChatMessage.Reasons.SIGNATURE, keypair);
			}
			// history.add(inLine);
			synchronized(out){
				out.write(lcmResponse+"\n");
				out.flush();
			}
		}
		System.out.println("Closing connection: "+s.getInetAddress()+":"+s.getPort());
		System.out.println("Time: "+System.currentTimeMillis());
		subscribers.removeElement(out);
		s.close();
		System.out.println("Connection closed");
	}

	public static void relayToSubscribers(Vector<LugChatMessage> messagesToRelay, Vector<PrintWriter> subscribers){
		while(keepAcceptingConnections){
			try{
				synchronized(messagesToRelay){
					//wait until someone .notify()s me of new messages in the relay queue
					messagesToRelay.wait(2000);
				}				
			} catch(InterruptedException ie){ } //timeout OK, just loop around
			//process messages in turn
			while(messagesToRelay.size() > 0){
				LugChatMessage msg = messagesToRelay.remove(0);
				for(PrintWriter out : subscribers){
					synchronized(out){
						out.write(msg+"\n");
						out.flush();
					}
				}
			}
		}
	}

	public static boolean keepAcceptingConnections = true;
	public static void main(String[] args){
		int listenPort = Integer.parseInt(args[0]);
		Vector<LugChatMessage> messageHistory = new Vector<>();
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
		ArrayList<Thread> connections = new ArrayList<>();
		Vector<PrintWriter> subscribers = new Vector<>();
		Vector<LugChatMessage> relayQueue = new Vector<>();
		Thread relayThread;
		try(ServerSocket servSock = new ServerSocket(listenPort); ){
			relayThread = new Thread(){public void run(){ relayToSubscribers(relayQueue,subscribers); }};
			relayThread.start();
			while(keepAcceptingConnections){
				Socket established = servSock.accept();
				Thread t = new Thread(){public void run(){ try{ handleClientConnection(established,messageHistory,keypair,subscribers, relayQueue);} catch(Exception e){ throw new RuntimeException("Exception in handleClientConnection", e); } }};
				connections.add(t);
				t.start();
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