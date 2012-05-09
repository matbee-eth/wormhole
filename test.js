$(document).ready(function() {
	var server = new Server();
	server.Execute("Hello", ["one","two","three"], function (fail, one, two, three) {
		console.log(one);
	});
	console.log("hey!");
});