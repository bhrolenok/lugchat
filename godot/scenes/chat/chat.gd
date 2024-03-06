extends Control

const URI = "wss://localhost:8080"

@onready var _client: ChatConnection = $ChatConnection
@onready var _history = $Panel/ScrollContainer/History
@onready var _line_edit = $Panel/VBoxContainer/Send/LineEdit
@onready var _reconnect = $ReconnectTimer

var post = preload("res://scenes/chat/post.tscn")

# Post tracking variables
var is_open = false
var last_post_time = 0

## Signals
func _on_ready():
	ws_connect()
	_line_edit.grab_focus()

func _on_chat_connection_connection_closed():
	is_open = false
	$OfflineLabel.visible = true
	var ws = _client.get_socket()
	print("Client just disconnected with code: %s, reason: %s" % [ws.get_close_code(), ws.get_close_reason()])
	_reconnect.start(5)

func _on_chat_connection_connected_to_server(newest: int):
	print("WS connection complete")
	is_open = true
	$OfflineLabel.visible = false
	_reconnect.stop()
	if newest > last_post_time:
		_client.history(last_post_time, newest)

func _on_chat_connection_message_received(message: Dictionary):
	display_post(message.get("nick"), message.get("timestamp"), message.get("content"))

func _on_reconnect_timer_timeout():
	ws_connect()

## UI Signals
func _on_line_edit_text_submitted(new_text):
	send_msg()

func _on_send_pressed():
	send_msg()

func _input(event):
	if _line_edit.has_focus():
		if event is InputEventKey and event.pressed and event.keycode == KEY_ENTER:
			get_viewport().set_input_as_handled()
			if event.shift_pressed:
				_line_edit.text += "\n"
				_line_edit.set_caret_line(_line_edit.get_line_count())
			else:
				send_msg();

func display_post(user:String, timestamp:int, content:String):
	var new_post = post.instantiate()
	new_post.get_node("HBoxContainer/User/Username").text = user
	new_post.get_node("HBoxContainer/User/Timestamp").text = Time.get_datetime_string_from_unix_time(timestamp)
	new_post.get_node("HBoxContainer/RichTextLabel").add_text(content)
	
	# Add the node to the correct location in the list
	_history.add_child(new_post)
	if timestamp < last_post_time:
		var post_list := _history.get_children()
		for i in range(post_list.size()):
			var node_time = Time.get_unix_time_from_datetime_string(post_list[i].get_node("HBoxContainer/User/Timestamp").text)
			if timestamp < node_time:
				_history.move_child(new_post, i)
				break
	last_post_time = timestamp

func send_msg():
	if not is_open: return

	var text = _line_edit.text
	if text == "": return

	_line_edit.text = ""
	_client.post(text)
	#display_post(UserProfile.nickname, Utils.get_utc_timestamp(), text)

# Attempt to connect to the configured websocket
func ws_connect():
	if _client.get_state() != WebSocketPeer.STATE_CLOSED:
		return
	prints("Connecting to:", URI)
	var err = _client.connect_to_url(URI)
	if err != OK:
		print("Error connecting to server: CODE-%s" % [err])
	print("State ", _client.get_state())
	

#func _process(delta):
	#_client.poll()



