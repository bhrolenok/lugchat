extends CanvasLayer

@onready var _nick = $Panel/Profile/UserField/UserText
@onready var _pass = $Panel/Profile/PasswordField/PasswordText
@onready var _server = $Panel/Profile/ServerField/ServerText

func _on_ready():
	var err = UserProfile.load_profile_basic()
	if err == OK:
		_nick.text = UserProfile.nickname
		_server.text = UserProfile.server_url
	else:
		print("error: ", err)

func _on_connect_button_pressed():
	var loaded: Error = ERR_UNCONFIGURED
	if _pass.text == "":
		print("Invalid password: empty")
	elif UserProfile.nickname == "":
		if _nick.text != "": 
			return
		loaded = UserProfile.generate_profile(_nick.text, _pass.text)
	elif _nick.text != UserProfile.nickname:
		print("Invalid nickname")
	else:
		loaded = UserProfile.load_private_key(_pass.text)

	if loaded == OK:
		get_tree().change_scene_to_file("res://scenes/chat/chat.tscn")
	else:
		print("Failed to load: ", loaded)

func _on_quit_pressed():
	get_tree().quit()

