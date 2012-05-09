var express = require('express'), app = express.createServer(), 
    io = require('socket.io').listen(app);
var appS = require('./appserver');

app.listen(8080); 
app.use(express.static(__dirname + '/'));

var downloads = {};
app.get('/', function (req, res) {
  var file = req.params[0];
  downloads[file] = downloads[file] || 0;
  downloads[file]++;
  next();
  console.log(downloads);
});

appServer = new appS.appserver(io);
appServer.Methods({
    Hello:function (parameters, callback) {
        // var f = (function(string){alert(string);});
        appServer.ExecuteJson(appServer.serverMethodQueue[callback].socket, function (string) {
            console.log("serverside: " + string);
        }, "string!");
        appServer.Trigger(callback, "world.", "balls", "big balls");
    }
});
appServer.WatchFiles(__dirname + '/index.html', function(client) {
    // appServer.ExecuteJson(client, function() { window.location.reload(); });
});
appServer.WatchFiles(__dirname + '/test.css', function(client) {
    // appServer.ExecuteJson(client, function() { window.location.reload(); });

});
appServer.WatchFiles(__dirname + '/test.js', function(client) {
    // appServer.ExecuteJson(client, function() { window.location.reload(); });
    
});