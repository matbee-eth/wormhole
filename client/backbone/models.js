Person = Backbone.Model.extend({
    defaults: {
        name: 'Fetus',
        age: 0,
        children: []
    },
    initialize: function(){
        alert("Welcome to this world");
        this.bind("change:name", function(){
            var name = this.get("name"); // 'Stewie Griffin'
            alert("Changed my name to " + name );
        });
    },
    replaceNameAttr: function( name ){
        this.set({ name: name });
    }
});