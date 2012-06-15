var i = 0;
(function() {
	window.server.Execute("Hello", ["one","two","three"], function (fail, one, two, three) {
		console.log(one);
		console.log(two);
		console.log(three);
		i++;
	});
})();
