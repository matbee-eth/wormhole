var Server = function (socket) {
	var _socket;
	var self = this;
	var connected = false;
	var executeQueue = [];

	this.Execute = function (method, parameters, callback) {
		if (connected) {
			var callbackId = __randomString();
			self.__socket.on(callbackId, function (parameters) {
				if (parameters.duplicate === true) {
					self.Execute(method, parameters, callback);
				}
				else {
					callback.apply(null, parameters);
				}
			});
			self.__socket.emit('Server.Methods', {callbackId:callbackId, method: method, parameters: parameters});
		}
		else {
			executeQueue.push({callback:callback, method: method, parameters: parameters});
		}
	};

	__randomString = function() {
		var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
		var string_length = 64;
		var randomstring = '';
		for (var i=0; i<string_length; i++) {
			var rnum = Math.floor(Math.random() * chars.length);
			randomstring += chars.substring(rnum,rnum+1);
		}
		return randomstring;
	};

	if (!socket) {
		self.__socket = io.connect();
		self.__socket.on('connect', function () {
			connected = true;
			for (var k in executeQueue) {
				self.Execute(executeQueue[k].method, executeQueue[k].parameters, executeQueue[k].callback);
				delete executeQueue[k];
			};
		});
	}
	else {
		connected = true;
		self.__socket = socket;
	}
	self.__socket.on('CHANGEFILES', function (filename) {
		// console.log(filename);
		if (filename.substr(filename.length-4) == ".css") {
			
		}
	});

	self.__socket.on('javascript', function (data) {
		var f = eval("("+data.func+")");
		f.apply(null, data.arguments);
	});

	return this;
};