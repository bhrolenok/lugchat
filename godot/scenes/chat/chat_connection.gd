extends Node
class_name ChatConnection

var tls_trusted_certificate : X509Certificate
var tls_verify := true

var crypto = Crypto.new()
var socket = WebSocketPeer.new()
var last_state = WebSocketPeer.STATE_CLOSED
var is_open = false

var key_dict:Dictionary = Dictionary()

signal connected_to_server(newest: int)
signal connection_closed()
signal connection_error(message: String)
signal message_received(message: Dictionary)

func connect_to_url(url) -> int:
	var tls: TLSOptions = TLSOptions.client_unsafe()
	print("ws:connect_to_url - connecting start")
	var err = socket.connect_to_url(url, tls)
	print("ws:connect_to_url - connecting done")
	if err != OK:
		return err
	last_state = socket.get_ready_state()
	print("ws:connect_to_url - OK, state: %d" % [last_state])
	return OK

func history(start: int, end: int) -> Error:
	var request = {
		"type": "history",
		"nick": UserProfile.nickname,
		"time": Utils.get_utc_timestamp(),
		"content": {
			"start": start,
			"end": end,
		}
	}
	return _send_request(request)

func post(message:String) -> int:
	var request = {
		"type": "post",
		"nick": UserProfile.nickname,
		"time": Utils.get_utc_timestamp(),
		"content": {
			"postContent": message,
		}
	}
	return _send_request(request)
	#if typeof(message) == TYPE_STRING:
		#return socket.send_text(message)
	#return socket.send(var_to_bytes(message))


func get_message() -> Variant:
	if socket.get_available_packet_count() < 1:
		return null
	var pkt = socket.get_packet()
	if socket.was_string_packet():
		return pkt.get_string_from_utf8()
	return bytes_to_var(pkt)


func close(code := 1000, reason := "") -> void:
	socket.close(code, reason)
	last_state = socket.get_ready_state()
	connection_closed.emit()


func clear() -> void:
	socket = WebSocketPeer.new()
	last_state = socket.get_ready_state()

func get_socket() -> WebSocketPeer:
	return socket

func get_state() -> WebSocketPeer.State:
	return last_state

func poll() -> void:
	var state = socket.get_ready_state()
	if state != socket.STATE_CLOSED:
		socket.poll()
	if last_state != state:
		print("ws:poll - state change: %d -> %d" % [last_state, state])
		last_state = state
		if state == socket.STATE_OPEN:
			call_deferred("_server_greeting")
		elif state == socket.STATE_CLOSED:
			print("emit closed")
			connection_closed.emit()
	while socket.get_available_packet_count() > 0:
		prints(socket.get_available_packet_count(), "packets available")
		var raw_message = get_message()
		if raw_message is String:
			var envelope = JSON.parse_string(raw_message)
			if envelope != null:
				_process_socket_message(envelope)
		else:
			print("Skipping unknown message: ", typeof(raw_message))


# ==============================================================================
# PRIVATE

func _process(_delta):
	poll()

func _ready():
	socket.inbound_buffer_size = 2048 * 1024

func _process_socket_message(envelope: Dictionary):
	var recheck_or_revoke_key = ""
	if _verify(envelope) != OK:
		return
	var message = envelope.get("message")
	match message.get("type"):
		"response":
			var orig_type = message.get("responseToType")
			print("Received response to ", orig_type)
			match orig_type:
				"hello":
					if message.get("response") != "accept":
						print("invalid hello response ", message)
						return
					recheck_or_revoke_key = _save_key(message, ["content", "serverKey", "serverKey"])
				"subscribe":
					if message.get("response") != "accept":
						# TODO: What to do when fail to login?
						return
					# Finally emit that we are connected to the server
					var content = message["content"]
					var first = content.get("oldestMessageTime", 0)
					var last = content.get("latestMessageTime", 0)
					if not last is int:
						last = int(last)
					connected_to_server.emit(last)
				"history":
					var history_list = Utils.nested_dict_get(message, ["content", "msgList"])
					if history_list != null:
						print("ws:_process_socket_message: Checking %d history messages" % [history_list.size()])
						for msg in history_list:
							_process_socket_message(msg)
				_:
					print("Ignoring response ", orig_type)
		"hello": # Store the key and mark the user as online
			recheck_or_revoke_key = _save_key(message, ["content", "publicKey"])
		"post":
			print("Received post")
			message_received.emit({
				"nick": message.get("nick"),
				"timestamp": message.get("time") / 1000,
				"content": Utils.nested_dict_get(message, ["content", "postContent"])
			})
		_:
			print("Ignoring: ", message.get("type"))
	
	if recheck_or_revoke_key != "":
		if _verify(envelope) != OK:
			key_dict.erase(recheck_or_revoke_key)
	return

func _save_key(message, key_path) -> String:
	var pub_key = Utils.nested_dict_get(message, key_path)
	if pub_key != null:
		var key_id = pub_key.md5_text()
		var new_key = CryptoKey.new()
		if new_key.load_from_string(pub_key, true) == OK:
			key_dict[key_id] = new_key
			return key_id
	print("Did not save key")
	return ""

#, callable: Callable
func _send_request(request: Dictionary) -> Error:
	print("sending request: ", request.get("type"))
	# Create the message envelope for the provided dictionary include signing using profile
	var sig = crypto.sign(HashingContext.HASH_SHA256, JSON.stringify(request).sha256_buffer(), UserProfile.private_key)
	var envelope = {
		"message": request,
		"sig": Marshalls.raw_to_base64(sig),
		"keyHash": UserProfile.pub_key_hash,
		"protocolVersion": 1,
	}
	
	# Now send the JSON message over a text stream
	return socket.send_text(JSON.stringify(envelope))

func _server_greeting():
	# Login to the server requires a Hello, followed by a Subscribe message.
	var pub_key = UserProfile.private_key.save_to_string(true)
	var err := _send_request({
		"type": "hello",
		"nick": UserProfile.nickname,
		"time": Utils.get_utc_timestamp(),
		"content": {
			"publicKey": pub_key
		}
	})
	if err != OK:
		close()
		connection_error.emit("Server negotiation failed: hello")
		return
	
	err = _send_request({
		"type": "subscribe",
		"nick": UserProfile.nickname,
		"time": Utils.get_utc_timestamp(),
		"content": {
			"publicKey": pub_key,
			"lastClientTime": 0,
		}
	})
	if err != OK:
		close()
		connection_error.emit("Handshake with server failed.")
		return

const SERVER_MESSAGE_REQUIRED_FIELDS = ["message", "sig", "keyHash", "protocolVersion"]

func _verify(server_message: Dictionary, skip_if_missing_key: bool = true) -> Error:
	if server_message == null:
		return ERR_INVALID_DATA

	# Ensure required fields are present
	for field in SERVER_MESSAGE_REQUIRED_FIELDS:
		if not server_message.has(field):
			return ERR_INVALID_DATA

	var key_id = server_message["keyHash"]
	if key_dict.has(key_id):
		var sender_pub_key: CryptoKey = key_dict[key_id]
		var signature = Marshalls.base64_to_raw(server_message["sig"])
		if not crypto.verify(HashingContext.HASH_SHA256, JSON.stringify(server_message["message"]).sha256_buffer(), signature, sender_pub_key):
			return ERR_UNAUTHORIZED
	elif skip_if_missing_key == false:
		return ERR_DOES_NOT_EXIST

	return OK
