class_name Utils

static func get_utc_timestamp() -> int:
	return floori(Time.get_unix_time_from_system() * 1000) 

static func nested_dict_get(dict:Dictionary, path:Array) -> Variant:
	var curr = dict
	var last_step:String = path.pop_back()
	for step in path:
		if curr.has(step):
			curr = curr.get(step)
		else:
			return null
	return curr.get(last_step)
