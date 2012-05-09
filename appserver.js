var fs = require('fs');
var Server = function (io) {
    var self = this;
    self.__io = io;
    self.__io.sockets.on('connection', function (socket) {
      socket.on('Server.Methods', function (data) {
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
    this.Methods = function (methods) {
        console.log("Server.Methods");
        for (var k in methods) {
            self.__methods[k] = methods[k];
        };
    };

    this.Execute = function (method, parameters, callbackId) {
        if (self.__methods[method]) {
            self.__methods[method](parameters, callbackId);
        }
    };

    this.ExecuteJson = function (socket, func) {
        var args = Array.prototype.slice.call(arguments);
            args = args.slice(2);

        socket.emit('javascript', {func: func.toString(), arguments: args});
    };

    this.trigger = function (callbackId, data) {
        if (self.serverMethodQueue[callbackId]) {
            var args = Array.prototype.slice.call(arguments);
            args = args.slice(1);
            var success = [null].concat(args);
            self.serverMethodQueue[callbackId].socket.emit(callbackId, success);
            delete self.serverMethodQueue[callbackId];
        };
    };

    this.fail = function (callbackId) {
        var args = Array.prototype.slice.call(arguments);
            args = args.slice(1);
        var fail = [true].concat(args);
        self.serverMethodQueue[callbackId].socket.emit(callbackId, fail);
        delete self.serverMethodQueue[callbackId];
    };

    var lastEdit = [];

    this.watchFiles = function (fileName, callback) {
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
                        var file = fileName.substr(fileName.indexOf(__dirname)+__dirname.length+1);
                        clients[k].emit('CHANGEFILES', file);
                        
                        if (fileName.substr(fileName.length-4) == ".css") {
                            appServer.ExecuteJson(client, function(fileName) {
                                $('link[rel="stylesheet"]').each(function () {
                                    if (this.href.substr(this.href.length - fileName.length) == fileName) {
                                        $(this).remove();

                                        var link = $("<link>");
                                        link.attr({
                                                type: 'text/css',
                                                rel: 'stylesheet',
                                                href: fileName
                                        });
                                        $("body").append( link );
                                    }
                                });
                            }, file);
                        }
                        else if (fileName.substr(fileName.length-3) == ".js") {
                            appServer.ExecuteJson(client, function (fileName) {
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

    return this;
};
exports.appserver = Server;