// LugChatMessages.java
import java.util.*;
import java.util.logging.*;
// import java.net.*;
import java.io.*;
import javax.json.*;
import java.security.*;
import java.security.spec.*;


public class LugChatMessage {

	/*
	General message format:
	{
	  message: <messageData>,
	  sig: <Base64>
	  protocolVersion: <number>,
	  keyHash: <hex>
	}

	Server response message format:
	{
	  type: “response”,
	  responseToType: <messageType>,
	  origSig: <Base64>,
	  response: ”{accept, reject}”, 
	  reason: ”{none, format, signature, access, exception}”,
	  time: <timestamp>,
	  content: <object>
	}

	messageData format:
	{ 
	  type: <type>,
	  nick: <str>,
	  time: <timestamp>,
	  content: <object>
	}

	type: {"response", "hello", "subscribe", "users", "post", "history", "reply", "disconnect"}
	Possible future types: "edit", server-to-server (separate protocol)
	*/

	public static final String KEY_ALGORITHM = "RSA";
	public static final String SIG_ALGORITHM = "SHA512withRSA";
	public static final String HSH_ALGORITHM = "MD5";

	public enum Types { HELLO, SUBSCRIBE, USERS, POST, HISTORY, REPLY, DISCONNECT, RESPONSE;
		@Override
		public String toString(){ return super.toString().toLowerCase(); } 
		public static Types fromString(String s){
			for(Types t : values())
				if(t.toString().equalsIgnoreCase(s))
					return t;
			throw new RuntimeException("Unrecognized message type: \""+s+"\"");
		}
	}

	public enum Responses { ACCEPT, REJECT;
		@Override
		public String toString(){ return super.toString().toLowerCase(); } 
		public static Responses fromString(String s){
			for(Responses r : values())
				if(r.toString().equalsIgnoreCase(s))
					return r;
			throw new RuntimeException("Unrecognized response type: \""+s+"\"");
		}
	}
	public enum Reasons {NONE, FORMAT, SIGNATURE, ACCESS, EXCEPTION;
		@Override
		public String toString(){ return super.toString().toLowerCase(); } 
		public static Reasons fromString(String s){
			for(Reasons r : values())
				if(r.toString().equalsIgnoreCase(s))
					return r;
			throw new RuntimeException("Unrecognized reason type: \""+s+"\"");
		}
	}

	protected JsonObject jsonRepresentation;

	public LugChatMessage(String jsonFormattedString){
		this(Json.createReader(new StringReader(jsonFormattedString)).readObject());
	}
	protected LugChatMessage(JsonObject jsonObject){
		jsonRepresentation = jsonObject;
	}

	public JsonObject getJSON(){ return jsonRepresentation; }

	@Override
	public String toString(){ return jsonRepresentation.toString(); }

	//creating messages
	protected static LugChatMessage makeMessage(JsonObject messageData, KeyPair kp) {
		try{
			// KeyFactory kfac = KeyFactory.getInstance(KEY_ALGORITHM);
			// PrivateKey priv = kfac.generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(base64PrivKey)));
			Signature signer = Signature.getInstance(SIG_ALGORITHM);
			signer.initSign(kp.getPrivate());
			signer.update(messageData.toString().getBytes());
			String signature = Base64.getEncoder().encodeToString(signer.sign());
			MessageDigest md = MessageDigest.getInstance(HSH_ALGORITHM);
			JsonObject msg = Json.createObjectBuilder()
				.add("message", messageData)
				.add("sig",signature)
				.add("protocolVersion","1")
				.add("keyHash",Base64.getEncoder().encodeToString(md.digest(kp.getPublic().getEncoded())))
				.build();
			return new LugChatMessage(msg);
		} catch(Exception e){
			throw new RuntimeException("Error constructing message", e);
		}
	}
	protected static JsonObject makeMessageData(Types type, String nick, JsonObject content) {
		return Json.createObjectBuilder()
			.add("type",type.toString())
			.add("nick",nick)
			.add("time",Long.toString(System.currentTimeMillis()))
			.add("content", content)
			.build();
	}

	protected static JsonObject makeResponseMessage(Types responseToType, String origSig, Responses resp, Reasons reason, JsonObject content){
		return Json.createObjectBuilder()
			.add("type",Types.RESPONSE.toString())
			.add("responseToType",responseToType.toString())
			.add("origSig",origSig)
			.add("response",resp.toString())
			.add("reason", reason.toString())
			.add("time", Long.toString(System.currentTimeMillis()))
			.add("content", content)
			.build();
	}
	public static LugChatMessage makeRejectResponseMessage(Types responseToType, String origSig, Reasons reason, KeyPair keypair){
		JsonObject respMessageData = makeResponseMessage(responseToType,origSig,Responses.REJECT,reason,Json.createObjectBuilder().build());
		return makeMessage(respMessageData,keypair);
	}
	protected static JsonObject makeAcceptResponseMessage(Types responseToType, String origSig, JsonObject content){
		return makeResponseMessage(responseToType,origSig,Responses.ACCEPT,Reasons.NONE,content);
	}

	public static LugChatMessage makeHelloMessage(String nick, KeyPair keypair) {
		String computedKeyHash = "."; //TODO: actually compute hash.
		String base64PubKey = Base64.getEncoder().encodeToString(keypair.getPublic().getEncoded());
		JsonObject messageData = makeMessageData(
			Types.HELLO,
			nick,
			Json.createObjectBuilder().add("publicKey",base64PubKey).add("keyHash",computedKeyHash).build() //TODO: cammelCase
		);
		return makeMessage(messageData,keypair);
	}
	public static LugChatMessage makeHelloResponseMessage(String origSig, KeyPair keypair){
		String base64ServerPubKey = Base64.getEncoder().encodeToString(keypair.getPublic().getEncoded());
		JsonObject respMessageData = makeAcceptResponseMessage(
			Types.HELLO, 
			origSig, 
			Json.createObjectBuilder().add("serverKey", base64ServerPubKey).build()
		);
		return makeMessage(respMessageData,keypair);
	}

	public static LugChatMessage makeSubscribeMessage(String nick, long lastClientTime, KeyPair keypair) {
		String base64PubKey = Base64.getEncoder().encodeToString(keypair.getPublic().getEncoded());
		JsonObject messageData = makeMessageData(
			Types.SUBSCRIBE,
			nick,
			Json.createObjectBuilder().add("publicKey",base64PubKey).add("lastClientTime",Long.toString(lastClientTime)).build()
		);
		return makeMessage(messageData,keypair);
	}
	public static LugChatMessage makeSubscribeResponseMessage(long oldest, long latest, String origSig, KeyPair keypair){
		JsonObject respMessageData = makeAcceptResponseMessage(
			Types.SUBSCRIBE,
			origSig,
			Json.createObjectBuilder().add("oldestMessageTime", Long.toString(oldest)).add("latestMessageTime", Long.toString(latest)).build()
		);
		return makeMessage(respMessageData,keypair);
	}

	public static LugChatMessage makeUsersMessage(String nick, long since, KeyPair keypair){
		JsonObject messageData = makeMessageData(
			Types.USERS,
			nick,
			Json.createObjectBuilder().add("since",Long.toString(since)).build()
		);
		return makeMessage(messageData,keypair);
	}
	//TODO: users response message
	public static LugChatMessage makeUsersResponseMessage(String origSig, KeyPair keypair){
		throw new RuntimeException("Not implemented");
	}

	public static LugChatMessage makePostMessage(String nick, String postContent, KeyPair keypair){
		JsonObject messageData = makeMessageData(
			Types.POST,
			nick,
			Json.createObjectBuilder().add("postContent",postContent).build()
		);
		return makeMessage(messageData,keypair);
	}
	public static LugChatMessage makePostResponseMessage(String origSig, KeyPair keypair){
		JsonObject respMessageData = makeAcceptResponseMessage(
			Types.POST,
			origSig,
			Json.createObjectBuilder().build()
		);
		return makeMessage(respMessageData,keypair);
	}

	public static LugChatMessage makeHistoryMessage(String nick, long start, long end, KeyPair keypair){
		JsonObject messageData = makeMessageData(
			Types.HISTORY,
			nick,
			Json.createObjectBuilder().add("start",Long.toString(start)).add("end",Long.toString(end)).build()
		);
		return makeMessage(messageData,keypair);
	}
	//TODO: history response message
	public static LugChatMessage makeHistoryResponseMessage(ArrayList<LugChatMessage> history, String origSig, KeyPair keypair){
		throw new RuntimeException("Not Implemented");
	}

	public static LugChatMessage makeReplyMessage(String nick, long postTime, String origSig, String replyContent, KeyPair keypair){
		JsonObject messageData = makeMessageData(
			Types.REPLY,
			nick,
			Json.createObjectBuilder().add("postTime",Long.toString(postTime)).add("origSig",origSig).add("replyContent",replyContent).build()
		);
		return makeMessage(messageData,keypair);
	}
	public static LugChatMessage makeReplyResponseMessage(String origSig, KeyPair keypair){
		JsonObject respMessageData = makeAcceptResponseMessage(
			Types.REPLY,
			origSig,
			Json.createObjectBuilder().build()
		);
		return makeMessage(respMessageData,keypair);
	}

	public static LugChatMessage makeDisconnectMessage(String nick, KeyPair keypair){
		JsonObject messageData = makeMessageData(
			Types.DISCONNECT,
			nick,
			Json.createObjectBuilder().build()
		);
		return makeMessage(messageData,keypair);
	}
	public static LugChatMessage makeDisconnectResponseMessage(String origSig, KeyPair keypair){
		JsonObject respMessageData = makeAcceptResponseMessage(
			Types.DISCONNECT,
			origSig,
			Json.createObjectBuilder().build()
		);
		return makeMessage(respMessageData,keypair);
	}

	//factory class for saving nick and signature
	public static class LugChatMessageFactory {
		public String nick;
		public KeyPair keypair;
		public LugChatMessageFactory(String n, KeyPair kp){ nick = n; keypair = kp; }
		public LugChatMessage makeHelloMessage(){ 
			return LugChatMessage.makeHelloMessage(nick,keypair); 
		}
		public LugChatMessage makeSubscribeMessage(long lastClientTime) {
			return LugChatMessage.makeSubscribeMessage(nick,lastClientTime,keypair);
		}
		public LugChatMessage makeUsersMessage(long since)  {
			return LugChatMessage.makeUsersMessage(nick,since,keypair);
		}
		public LugChatMessage makePostMessage(String postContent)  {
			return LugChatMessage.makePostMessage(nick,postContent,keypair);
		}
		public LugChatMessage makeHistoryMessage(long start, long end)  {
			return LugChatMessage.makeHistoryMessage(nick,start,end,keypair);
		}
		public LugChatMessage makeReplyMessage(long postTime, String origSig, String replyContent)  {
			return LugChatMessage.makeReplyMessage(nick,postTime,origSig,replyContent,keypair);
		}
		public LugChatMessage makeDisconnectMessage()  {
			return LugChatMessage.makeDisconnectMessage(nick,keypair);
		}
	}

	//wrapper accessors
	public String getSignature(){
		return getJSON().getString("sig");
	}
	public String getProtocolVersion(){
		return getJSON().getString("protocolVersion");
	}
	public String getKeyHash(){
		return getJSON().getString("keyHash");
	}
	protected String getMessageString(){
		return getJSON().getJsonObject("message").toString();
	}

	//verify message
	public boolean sigVerified(String base64PubKey){
		try{
			KeyFactory kfac = KeyFactory.getInstance(KEY_ALGORITHM);
			PublicKey pub = kfac.generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(base64PubKey)));
			Signature verifier = Signature.getInstance(SIG_ALGORITHM);
			verifier.initVerify(pub);
			verifier.update(getMessageString().getBytes());
			return verifier.verify(Base64.getDecoder().decode(getSignature()));
		} catch(Exception e){
			throw new RuntimeException("Error verifying signature",e);
		}
	}

	//messageData accessors
	public Types getType(){ 
		return Types.fromString(getJSON().getJsonObject("message").getString("type"));
	}
	public String getSendingNick(){
		return getJSON().getJsonObject("message").getString("nick");
	}
	public String getTimestamp(){
		return getJSON().getJsonObject("message").getString("time");
	}
	public JsonObject getContent(){
		return getJSON().getJsonObject("message").getJsonObject("content");
	}
	//hello messages
	public String getHelloPublicKey(){
		return getContent().getString("publicKey");
	}
	//post messages
	public String getPostContent(){
		return getContent().getString("postContent");
	}

	//server response accessors (NOTE: will throw RuntimeException on non RESPONSE type)
	public Types getResponseToType(){
		//TODO: update to cammelCase
		return Types.fromString(getJSON().getJsonObject("message").getString("responseToType"));
	}
	public String getOriginalSignature(){
		return getJSON().getJsonObject("message").getString("origSig");
	}
	public Responses getResponse(){
		return Responses.fromString(getJSON().getJsonObject("message").getString("response"));
	}
	public Reasons getReason(){
		return Reasons.fromString(getJSON().getJsonObject("message").getString("reason"));
	}
	public String getHelloResponseServerKey(){
		//TODO: update to cammelCase
		return getContent().getString("serverKey");
	}
}