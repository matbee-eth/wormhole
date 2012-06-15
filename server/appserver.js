var fs = require('fs');
var parseCookie = require('connect').utils.parseCookie;
var uglify = require('uglify-js'),
    jsp = uglify.parser,
    pro = uglify.uglify,
    jsdom = require('jsdom'),
    jquery = require('jquery');

var Server = function (io, sessionStore) {
    var self = this;
    var executeQueue = [];
    var _hooks = [];

    self.__io = io;
    self.__io.sockets.on('connection', function (socket) {
      socket.on('Server.Methods', function (data) {
        if (self.serverMethodQueue[data.callbackId]) {
            socket.emit(data.callbackId, {duplicate: true});
        }
        else {
            self.serverMethodQueue[data.callbackId] = {socket: socket, method: data.method, parameters: data.parameters};
            self.Execute(data.method, data.parameters, data.callbackId);
            for (var k in _hooks) {
                var serverCallbackId = __randomString();
                socket.emit('hook', {event: _hooks[k].event, element: _hooks[k].element, callbackId: serverCallbackId});
                
                socket.on(serverCallbackId, function() {
                    var hook = new methodClass(socket);
                    _hooks[k].callback.apply(hook, [].slice.call(arguments));
                });
            }
        }
      });
    });

    self.serverMethodQueue = [];

    this.__methods = [];
    this.__watchFiles = [];
    var methodClass = function (callbackId) {
        var socket;
        if (callbackId.constructor.name == "Socket") {
            socket = callbackId;
        }
        else {
            socket = self.serverMethodQueue[callbackId].socket;
        }
        this.$ = function () {
            var args = [].slice.call(arguments);
            if (typeof args[0] === 'function') {
                self.ExecuteJavascript(socket, args[0], args.slice(1));
            }
            else {
                self.Trigger(callbackId, args);
            }
        };
        this.$.get = function (clientFunction, callbackFunction, arguments) {
            var serverCallbackId = __randomString();
            if (!arguments) {
                arguments = [];
            }
            socket.emit('get', {func: clientFunction.toString(), callbackId: serverCallbackId, arguments: arguments});
            socket.on(serverCallbackId, function () {
                callbackFunction.apply(null, [].slice.call(arguments)[0]);
            });
        };
        return this.$;
    };
    this.Methods = function (methods) {
        for (var k in methods) {
            self.__methods[k] = methods[k];
        };
    };

    this.Execute = function (method, parameters, callbackId) {
        var executeMethod = new methodClass(callbackId);
        if (self.__methods[method]) {
            self.__methods[method].call(executeMethod.$, parameters, callbackId);
        }
    };

    // ExecuteJavaScript allows you to execute arbitrary javascript code on the client without the need of loading a <script>
    // It automatically uglifies/minifies your function so you don't have to.
    // Make sure it's a function.
    //
    // var elmo = function (param1, param2, param3) {
    //      console.log(param1);
    //      // etc.
    //}
    //
    // ExecuteJavascript(socket, elmo, param1, param2, param3);le.log
    this.ExecuteJavascript = function (socket, func) {
        if (socket.constructor.name !== "Socket") {
            if (self.serverMethodQueue[socket].socket) {
                socket = self.serverMethodQueue[socket].socket
            }
        }
        var ast = jsp.parse("var func="+func.toString()),
        ast = pro.ast_mangle(ast);
        ast = pro.ast_squeeze(ast);
        var finalCode = pro.gen_code(ast);
        var args = Array.prototype.slice.call(arguments);
        if (Array.isArray(args[2])) {
            args = args[2];
        }
        else {
            args = [].slice.call(arguments);
            args = args.slice(2);
        }

        socket.emit('javascript', {func: finalCode.toString().substring("var func=".length), arguments: args});
    };

    // Trigger allows you to execute the callback on the client
    // Each callback is assigned a callbackId in the serverMethodQueue array.
    this.Trigger = function (callbackId, args) {
        if (self.serverMethodQueue[callbackId]) {
            var success = [null].concat(args);
            self.serverMethodQueue[callbackId].socket.emit(callbackId, success);
            delete self.serverMethodQueue[callbackId];
        };
    };

    this.Fail = function (callbackId) {
        var args = Array.prototype.slice.call(arguments);
            args = args.slice(1);
        var fail = [true].concat(args);
        self.serverMethodQueue[callbackId].socket.emit(callbackId, fail);
        delete self.serverMethodQueue[callbackId];
    };



    this.Hook = function (event, element, callback) {
        _hooks.push({event: event, element: element, callback: callback});
        var clients = self.__io.sockets.clients();
        for (var k in clients) {
            var serverCallbackId = __randomString();
            var socket = clients[k];
            socket.emit('hook', {event: event, element: element, callbackId: serverCallbackId});
            socket.on(serverCallbackId, function() {
                var hook = new methodClass(socket);
                callback.apply(hook, [].slice.call(arguments));
            });
        }
    };

    var lastEdit = [];

    this.WatchFiles = function (fileName, callback) {
        if (fileName) {
            fs.watchFile(fileName, function (curr, prev) {
                if (lastEdit[fileName]) {
                    return false;
                }
                else {
                    lastEdit[fileName] = setTimeout(function () {
                        delete lastEdit[fileName];
                    }, 100);
                }
                var clients = self.__io.sockets.clients();
                for (var k in clients) {
                    var client = clients[k];
                    setTimeout(function() {
                        var file = fileName.replace(__dirname, "");
                        file = file.replace("../client/", "");
                        if (fileName.substr(fileName.length-4) == ".css") {
                            self.ExecuteJavascript(client, function(fileName) {
                                $('link[rel="stylesheet"]').each(function () {
                                    if (this.href.substr(this.href.length - fileName.length) == fileName) {
                                        $(this).remove();
                                    }
                                });
                            }, file);

                            self.ExecuteJavascript(client, function (fileName) {
                                var link = $("<link>");
                                link.attr({
                                        type: 'text/css',
                                        rel: 'stylesheet',
                                        href: fileName
                                });
                                setTimeout(function() {
                                    $("body").append(link);
                                    // $("body").remove(link);
                                }, 75);
                            }, file);
                        }
                        else if (fileName.substr(fileName.length-3) == ".js") {
                            self.ExecuteJavascript(client, function (fileName) {
                                $('script').each(function () {
                                    if (this.src.substr(this.src.length - fileName.length) == fileName) {
                                        $(this).remove();
                                        var script = document.createElement("script");
                                        script.type = "text/javascript";
                                        script.src = fileName;

                                        document.body.appendChild(script);
                                    }
                                });
                            }, file);
                        }
                        else if (fileName.indexOf(".template.html") > -1) {
                            var window = jsdom.jsdom("<html><head></head><body>"+fs.readFileSync(fileName)+"</body>").createWindow();

                            jsdom.jQueryify(window, function() {
                                var script = window.$("script");
                                var id = script.attr('id');
                                var type = script.attr('type');
                                var text = script.text();
                                deleteTemplate(id, type, text);
                            });

                            var deleteTemplate = function (id, type, templateContents) {
                                var arr = [].slice.call(arguments);
                                self.ExecuteJavascript(client, function (id, type, templateContents) {
                                    $("#"+id).remove();
                                    var script = document.createElement("script");
                                        script.id = id;
                                        script.type = type;
                                        script.text = templateContents;
                                    document.body.appendChild(script);
                                }, id, type, templateContents);
                            }
                        }
                        callback(clients[k]);
                    }, 100)
                }
            });
            self.__watchFiles.push(fileName);
            return self.__watchFiles;
        }
        else {
            return self.__watchFiles;
        }
    };
    this.$ = this.ExecuteJavascript;
    return this;
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

exports.appserver = Server;