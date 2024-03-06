extends Node

const PROFILE := "user://profile.dat"

var nickname: String
var server_url: String = "wss://localhost:8080"

# Loaded RSA key to use for signing and verifying
var private_key: CryptoKey = null
# MD5 hash of the public key, needed for envelope
var pub_key_hash: String

var raw_key: String = ""

# 
func generate_profile(nick: String, password: String, server: String = "wss://localhost:8080") -> Error:
	var crypto := Crypto.new()
	nickname = nick
	private_key = crypto.generate_rsa(4096)
	server_url = server
	_gen_key_metadata()
	return save_profile(password)

func load_private_key(password:String) -> Error:
	if raw_key == "":
		return ERR_DOES_NOT_EXIST
	
	# Decrypt ECB
	var encrypted = Marshalls.base64_to_raw(raw_key)
	var key: PackedByteArray = _transform_pass(password)
	var aes = AESContext.new()
	aes.start(AESContext.MODE_ECB_DECRYPT, key)
	var decrypted = aes.update(encrypted)
	aes.finish()
	
	private_key = CryptoKey.new()
	if private_key.load_from_string(decrypted.get_string_from_utf8()) != OK:
		print("Failed to load key")
		return ERR_INVALID_DATA

	raw_key = ""
	_gen_key_metadata()
	return OK

## Loads profile from disk without opening private key
func load_profile_basic() -> Error:
	if not FileAccess.file_exists(PROFILE):
		return ERR_FILE_NOT_FOUND

	var file_handle := FileAccess.open(PROFILE, FileAccess.READ)
	if not file_handle:
		print("Failed to open profile: ", FileAccess.get_open_error())
		return ERR_FILE_CANT_OPEN
		
	var profile_json := file_handle.get_as_text()
	file_handle.close()
	
	var json := JSON.new()
	if json.parse(profile_json):
		print("Failed to load profile, JSON parse error: ", json.get_error_message())
		return ERR_FILE_CORRUPT
	
	var data: Dictionary = json.data
	nickname = data.get("nick")
	server_url = data.get("server")
	raw_key = data.get("private_key")
	
	return OK

## Loads the profile from disk and decrypts private key using the specified password.
func load_profile_with_key(password:String) -> Error:
	var error = load_profile_basic()
	if error: 
		return error
	return load_private_key(password)


func save_profile(password: String) -> Error:
	var key: PackedByteArray = _transform_pass(password)
	
	# Serialize the private key and make sure output is a multiple of 16
	var pkey = _crypto_pad(private_key.save_to_string().to_utf8_buffer(), 16)
	# Encrypt ECB
	var aes := AESContext.new()
	aes.start(AESContext.MODE_ECB_ENCRYPT, key)
	pkey = Marshalls.raw_to_base64(aes.update(pkey))
	aes.finish()

	var file_handle := FileAccess.open(PROFILE, FileAccess.WRITE)
	if not file_handle:
		print("Failed to save profile: ", FileAccess.get_open_error())
		return FileAccess.get_open_error()

	var profile := {
		"nick": nickname,
		"server": server_url,
		"private_key": pkey,
	}
	file_handle.store_string(JSON.stringify(profile))
	file_handle.close()
	return OK

"""
Pad a buffer to an integer multiple of a byte size with the PKCS5 scheme. The
padding is always applied even if the input buffer is already multiple of the 
byte size in length.
@param data Input buffer
@param multiple  The byte multiple that output will equal.  Must be between 4 and 124.
@return Padded buffer.
"""
func _crypto_pad(data: PackedByteArray, multiple:int = 8) -> PackedByteArray:
	assert(multiple >- 0x04)
	assert(multiple <= 0x7f)
	multiple = multiple & 0x7c
	
	var ilen:int = data.size()
	var blen:int = ilen + (multiple - (ilen % multiple))

	var n:int = blen - ilen
	if (n == 0): n = multiple

	for i in range(n):
		data.append(n)

	return data

"""
Remove PKCS5 padding from a buffer. Assumes padding is present.
@param data Input buffer
@return Input buffer with padding removed.
"""
func _crypto_unpad(data: PackedByteArray) -> PackedByteArray:
	var ilen: int = data.size()
	var n:    int = data[ilen-1]
	assert(n >  0x00)
	assert(n <= 0x7c)
	return data.slice(0, ilen-n-1)

func _gen_key_metadata():
	var pub_key_pem = private_key.save_to_string(true)
	var md5 := HashingContext.new()
	md5.start(HashingContext.HASH_MD5)
	md5.update(pub_key_pem.to_utf8_buffer())
	pub_key_hash = md5.finish().hex_encode()
	return

func _transform_pass(password:String) -> PackedByteArray:
	var sha := HashingContext.new()
	sha.start(HashingContext.HASH_SHA256)
	sha.update(password.to_utf8_buffer())
	return sha.finish()
