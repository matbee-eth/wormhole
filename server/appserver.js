var fs = require('fs');
var parseCookie = require('connect').utils.parseCookie;
var uglify = require('uglify-js'),
    jsp = uglify.parser,
    pro = uglify.uglify;

var Server = function (io, sessionStore) {
    var self = this;
    var executeQueue = [];

    self.__io = io;
    self.__io.sockets.on('connection', function (socket) {
      socket.on('Server.Methods', function (data) {
        // console.log(socket.handshake.cookie['express.sid']);
        // console.log(sessionStore);
        // sessionStore.get(socket.handshake.cookie['express.sid'], function (err, session) {
        //     if (!err) {
        //         console.log(session);
        //     }
        //     else {
        //         console.log(err);
        //     }
        // });

        if (appServer.serverMethodQueue[data.callbackId]) {
            socket.emit(data.callbackId, {duplicate: true});
        }
        else {
            appServer.serverMethodQueue[data.callbackId] = {socket: socket, method: data.method, parameters: data.parameters};
            appServer.Execute(data.method, data.parameters, data.callbackId);
        }
      });
    });

    self.serverMethodQueue = [];

    this.__methods = [];
    this.__watchFiles = [];
    var methodClass = function (callbackId) {
        var socket = self.serverMethodQueue[callbackId].socket;
        this.$ = function () {
            var args = [].slice.call(arguments);
            console.log(args);
            if (typeof args[0] === 'function') {
                self.ExecuteJavascript(socket, args[0], args);
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
                console.log(arguments);
                callbackFunction.apply(null, [].slice.call(arguments)[0]);
            });
        };
    };

    this.Methods = function (methods) {
        for (var k in methods) {
            self.__methods[k] = methods[k];
        };
    };

    this.Execute = function (method, parameters, callbackId) {
        var executeMethod = new methodClass(callbackId);
        if (self.__methods[method]) {
            self.__methods[method].call(executeMethod, parameters, callbackId);
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
    // ExecuteJavascript(socket, elmo, param1, param2, param3);
    this.ExecuteJavascript = function (socket, func, args) {
        if (socket.constructor.name !== "Socket") {
            if (self.serverMethodQueue[socket].socket) {
                socket = self.serverMethodQueue[socket].socket
            }
        }

        var ast = jsp.parse("var func="+func.toString()),
        ast = pro.ast_mangle(ast);
        ast = pro.ast_squeeze(ast);
        var finalCode = pro.gen_code(ast);

        // var args = Array.prototype.slice.call(arguments);
        //     args = args.slice(2);

        socket.emit('javascript', {func: finalCode.toString().substring("var func=".length), arguments: args.slice(1)});
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
                            appServer.ExecuteJavascript(client, function(fileName) {

                                $('link[rel="stylesheet"]').each(function () {
                                    if (this.href.substr(this.href.length - fileName.length) == fileName) {
                                        $(this).remove();
                                    }
                                });
                            }, file);

                            appServer.ExecuteJavascript(client, function (fileName) {
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

                            appServer.ExecuteJavascript(client, function(fileName) {

                                
                            }, file);
                        }
                        else if (fileName.substr(fileName.length-3) == ".js") {
                            appServer.ExecuteJavascript(client, function (fileName) {
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
    this.__noSuchMethod__ = function () {
        console.log("NO SUCH METHOD");
    }
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