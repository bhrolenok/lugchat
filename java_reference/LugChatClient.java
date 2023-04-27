// LugChatClient.java
import java.util.*;
import java.util.logging.*;
import java.net.*;
import java.io.*;
import javax.json.*;
import javax.json.stream.*;
import java.security.*;
import java.security.spec.*;
import java.nio.*;

public class LugChatClient {

	public static boolean notStopping;
	public static Logger logger;
	public static final char[] hexChars = "0123456789abcdef".toCharArray();

	public static void parseServerMessages(BufferedReader in, Vector<LugChatMessage> messageQueue){
		while(notStopping){
			try{
				String line = in.readLine();
				LugChatMessage lcm = new LugChatMessage(line);
				logger.info("Rx: '"+lcm+"'");
				messageQueue.add(lcm);
				synchronized(messageQueue){
					messageQueue.notify();
				}
			} catch(Exception e){ throw new RuntimeException(e); }
		}
	}
	
	private static String shortName(LugChatMessage lcm, int desiredCharacters){
		int numBytes = desiredCharacters/2;
		//md5 hash is 128 bits = 16 bytes
		if(numBytes<=0) return "";
		// if(numBytes%2 != 0) numBytes+=1; //shouldn't care if the number of BYTES is odd...
		if(numBytes > 16) numBytes = 16;
		//a hex digit is 16 bits
		int numHexDigits = numBytes*2;
		//base64 digits are 6 bits, minimum of 4 digits = 24 bits (or 3 bytes) per group
		//should need no more than 5 groups of 4 (or 20) base64 digits
		int numBase64Digits = 20;
		char[] cbuff = new char[numHexDigits];
		byte[] hashBytes = Arrays.copyOfRange(Base64.getDecoder().decode(lcm.getKeyHash().substring(0,numBase64Digits)),0,numHexDigits/2);
		for(int i=0;i<hashBytes.length;i++){
			cbuff[2*i] = hexChars[(hashBytes[i]>>4)&0x0f];
			cbuff[2*i+1] = hexChars[(hashBytes[i])&0x0f];
		}
		return new String(cbuff);
	}

	public static void processMessageQueue(Vector<LugChatMessage> messageQueue){
		String serverPubKeyEncoded = null;
		while(notStopping){
			if(messageQueue.size()>0){
				if(serverPubKeyEncoded == null){
					//if we haven't seen the server key yet, look for it in the messageQueue
					for(int i=0;i<messageQueue.size();i++){
						LugChatMessage lcm = messageQueue.get(i);
						if(lcm.getType()==LugChatMessage.Types.RESPONSE){
							if(lcm.getResponseToType()==LugChatMessage.Types.HELLO){
								serverPubKeyEncoded = lcm.getHelloResponseServerKey();
							}
						}
					}
					if(serverPubKeyEncoded == null){
						try{
							synchronized(messageQueue){
								messageQueue.wait(2000);
							}
						} catch(InterruptedException ie){ } //timeout OK, loops around
					}
				} else {
					//pop a message
					LugChatMessage lcm = messageQueue.remove(0);
					//verify sig
					//TODO: Make a verifier for the appropriate key to handle relay messages
					boolean sigCheck = lcm.sigVerified(serverPubKeyEncoded);
					logger.info("Message: "+lcm+" Verified: "+sigCheck);
					if(lcm.getType()==LugChatMessage.Types.POST){
						String from = lcm.getSendingNick()+"|"+shortName(lcm,6)+"|"+((sigCheck)?"+":"-");
						System.out.println("\n"+from+"> "+lcm.getPostContent());
						System.out.print(">");
					}
				}
			} else {
				try{
					synchronized(messageQueue){
						messageQueue.wait(2000);						
					}
				} catch(InterruptedException ie){ } //timeout exception is OK, just loop around
			}
		}
	}

	public static void processMessageOutQueue(Vector<LugChatMessage> messageOutQueue, PrintWriter out){
		while(notStopping){
			if(messageOutQueue.size()>0){
				LugChatMessage lcm = messageOutQueue.remove(0);
				out.write(lcm+"\n"); out.flush();
				//if is a disconnect message, update notStopping for everyone
				if(lcm.getType()==LugChatMessage.Types.DISCONNECT){
					notStopping = false;
				}
			} else {
				try{
					synchronized(messageOutQueue){
						messageOutQueue.wait(2000);
					}
				} catch(InterruptedException ie){ } //timeout exception is OK, just loop around
			}
		}
	}

	public static void processUserInput(Scanner scan, Vector<LugChatMessage> messageOutQueue, String nick, KeyPair keypair){
		String userInput;
		LugChatMessage.LugChatMessageFactory lcmf = new LugChatMessage.LugChatMessageFactory(nick,keypair);
		while(notStopping){
			System.out.print(">");
			userInput = scan.nextLine();
			if(userInput.equalsIgnoreCase(".disconnect")){
				messageOutQueue.add(lcmf.makeDisconnectMessage());
			} else{
				messageOutQueue.add(lcmf.makePostMessage(userInput));
			}
			synchronized(messageOutQueue){
				messageOutQueue.notify();
			}
		}
	}

	public static void main(String[] args){
		try(
			Socket s = new Socket(args[0],Integer.parseInt(args[1]));
			PrintWriter out = new PrintWriter(s.getOutputStream(),true);
			BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream()));
		) {
			//logging
			logger = Logger.getLogger(LugChatClient.class.getName());
			logger.setUseParentHandlers(false);
			FileHandler logout = new FileHandler("lugchat-client.log",true);
			logout.setFormatter(new SimpleFormatter());
			logger.addHandler(logout);
			logger.setLevel(Level.ALL);
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
			Vector<LugChatMessage> messageQueue = new Vector<>();
			Vector<LugChatMessage> messageOutQueue = new Vector<>();
			//make hello message for the first thing in messageOutQueue
			LugChatMessage helloMsg = LugChatMessage.makeHelloMessage(
				args[2],	//nick
				keypair		//keypair
			);
			messageOutQueue.add(helloMsg);
			//Thread for parsing server messages
			Thread psmThread = new Thread(){ public void run(){ parseServerMessages(in,messageQueue); }};
			//Thread for handling user input
			Thread puiThread = new Thread(){ public void run(){ processUserInput(scan,messageOutQueue,args[2], keypair); }};
			//Thread for processing INCOMING messages
			Thread pmqThread = new Thread(){ public void run(){ processMessageQueue(messageQueue); }};
			//Thread for processing OUTGOING messages
			Thread pmoqThread = new Thread(){ public void run(){ processMessageOutQueue(messageOutQueue,out); }};
			//Start threads
			psmThread.start(); pmqThread.start(); pmoqThread.start(); puiThread.start();
			//join threads with shared reader/writer/stream objects
			psmThread.join(); pmqThread.join(); puiThread.join(); pmoqThread.join();
			//finalize the logger
			logout.flush();
			logout.close();
		} catch(Exception e){
			throw new RuntimeException(e);
		}
	}
}