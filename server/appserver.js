var fs = require('fs');
var parseCookie = require('cookie').parse;
var randomstring = require("randomstring-extended");
var uglify = require('uglify-js'),
    jsp = uglify.parser,
    pro = uglify.uglify,
    jsdom = require('jsdom'),
    jquery = require('jquery');

var Server = function (io, couchdb, sessionStore) {
    var self = this;
    var executeQueue = [];
    var _hooks = [];
    var _clients = [];
    self.__couch = couchdb;
    self.__io = io;
    self.__io.sockets.on('connection', function (socket) {
        var sess = socket.handshake.session;
          socket.log.info(
              'a socket with sessionID'
            , socket.handshake.sessionID
            , 'connected'
          );

        var clientObject = new methodClass(socket);
        _clients.push(clientObject);

        for (var k in _hooks) {
            var serverCallbackId = randomstring.generate(64);
            socket.emit('hook', {event: _hooks[k].event, element: _hooks[k].element, callbackId: serverCallbackId});
            
            socket.on(serverCallbackId, function() {
                _hooks[k].callback.apply(clientObject, [].slice.call(arguments));
            });
        }
        socket.on('Server.Methods', function (data) {
            if (self.serverMethodQueue[data.callbackId]) {
                socket.emit(data.callbackId, {duplicate: true});
            }
            else {
                self.serverMethodQueue[data.callbackId] = {socket: socket, method: data.method, parameters: data.parameters};
                self.Execute(data.method, data.parameters, data.callbackId);
            }
        });
        socket.on('disconnect', function (socket) {
            // _clients.delete(socket);
            var indexOfSocket = _clients.indexOf(socket);
            _clients.splice(indexOfSocket,1);
        });
    });

    self.serverMethodQueue = [];

    this.__methods = [];
    this.__watchFiles = [];
    var methodClass = function (callbackId) {
        var self = this;
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
        
        this.$.return = self.$;

        this.$.get = function (clientFunction, callbackFunction, arguments) {
            var serverCallbackId = randomstring.generate(64);
            if (!arguments) {
                arguments = [];
            }
            socket.emit('get', {func: clientFunction.toString(), callbackId: serverCallbackId, arguments: arguments});
            socket.on(serverCallbackId, function () {
                callbackFunction.apply(null, [].slice.call(arguments)[0]);
            });
        };
        this.$.on = function (event, element, callback) {
            var serverCallbackId = randomstring.generate(64);
            socket.emit('hook', {event: event, element: element, callbackId: serverCallbackId});
            socket.on(serverCallbackId, function() {
                var hook = new methodClass(socket);
                callback.apply(hook, [].slice.call(arguments));
            });
        }
        return this.$;
    };
    this.Methods = function (methods) {
        process.nextTick(function() {
            for (var k in methods) {
                self.__methods[k] = methods[k];
            };
        });
    };

    this.Execute = function (method, parameters, callbackId) {
        process.nextTick(function() {
            var executeMethod = new methodClass(callbackId);
            if (self.__methods[method]) {
                self.__methods[method].call(executeMethod, parameters, callbackId);
            }
        });
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
        var exArgs = arguments;
        process.nextTick(function() {
            if (socket.constructor.name !== "Socket") {
                if (self.serverMethodQueue[socket].socket) {
                    socket = self.serverMethodQueue[socket].socket
                }
            }
            var ast = jsp.parse("var func="+func.toString()),
            ast = pro.ast_mangle(ast);
            ast = pro.ast_squeeze(ast);
            var finalCode = pro.gen_code(ast);
            var args = Array.prototype.slice.call(exArgs);
            if (Array.isArray(args[2])) {
                args = args[2];
            }
            else {
                args = [].slice.call(exArgs);
                args = args.slice(2);
            }
            socket.emit('javascript', {func: finalCode.toString().substring("var func=".length), arguments: args});
        });
    };

    // Trigger allows you to execute the callback on the client
    // Each callback is assigned a callbackId in the serverMethodQueue array.
    this.Trigger = function (callbackId, args) {
        process.nextTick(function() {
            if (self.serverMethodQueue[callbackId]) {
                var success = [null].concat(args);
                self.serverMethodQueue[callbackId].socket.emit(callbackId, success);
                delete self.serverMethodQueue[callbackId];
            };
        });
    };

    this.Fail = function (callbackId) {
        process.nextTick(function() {
            var args = Array.prototype.slice.call(arguments);
                args = args.slice(1);
            var fail = [true].concat(args);
            self.serverMethodQueue[callbackId].socket.emit(callbackId, fail);
            delete self.serverMethodQueue[callbackId];
        });
    };

    this.on = function (event, element, callback, __socket) {
        process.nextTick(function() {
            if (!__socket) { // Only push to the public hooks array if every connected client gets attached.
                _hooks.push({event: event, element: element, callback: callback});
                var clients = self.__io.sockets.clients();
                for (var k in clients) {
                    var serverCallbackId = randomstring.generate(64);
                    var socket = clients[k];
                    socket.emit('hook', {event: event, element: element, callbackId: serverCallbackId});
                    socket.on(serverCallbackId, function() {
                        var hook = new methodClass(socket);
                        callback.apply(hook, [].slice.call(arguments));
                    });
                }
            }
            else {
                    var serverCallbackId = randomstring.generate(64);
                    var socket = __socket;
                    socket.emit('hook', {event: event, element: element, callbackId: serverCallbackId});
                    socket.on(serverCallbackId, function() {
                        var hook = new methodClass(socket);
                        callback.apply(hook, [].slice.call(arguments));
                    });
            }
        });
    };

    var lastEdit = [];

    this.WatchFiles = function (fileName, callback) {
        process.nextTick(function() {
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
                            var file = fileName.replace('/client/', "/server/")
                            file = file.replace(__dirname, "");
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
                            var hook = new methodClass(clients[k]);
                            process.nextTick(function() {
                                callback.call(hook);
                            });
                        }, 100)
                    }
                });
                self.__watchFiles.push(fileName);
                return self.__watchFiles;
            }
            else {
                return self.__watchFiles;
            }
        });

    };

    // this.Backbone = {
    //     Model: {
    //         extend: function (model) {
    //             console.log("---BACKBONE---");
    //             console.log("---BACKBONE---");
    //             console.log("---BACKBONE---");
    //             console.log(JSON.stringify(model, function (key, value) {
    //                 if (typeof value === 'function') {
    //                     var s = value.toString();
    //                     return s;
    //                 }
    //                 return value;
    //             }));
    //             console.log("---BACKBONE---");
    //             console.log("---BACKBONE---");
    //             console.log("---BACKBONE---");
    //         }
    //     }
    // }

    this.Clients = function () {
        return _clients;
    };
    return this;
};

exports.appserver = Server;