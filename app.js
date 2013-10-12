
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , https = require('https')
  , mongoose = require('mongoose')
  , path = require('path')
  , ejs = require("ejs")
  , fs = require("fs")
  , $ = require("cheerio");

// load local libraries
require("./model");

var app = express();
// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.session({ secret: 'markdown-chat-0E46CB44-0B66-4B74-AD6B-8D467D51FBC8' }));
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// routing
var routes = require("./routes");
routes.routes.forEach(function(r) {
    if (r.get_url && r.get) { 
        if (r.get_url instanceof Array) {
            r.get_url.forEach(function(u) {
                app.get(u, r.get);
            });
        }
        else {
            app.get(r.get_url, r.get);
        }
    }
    if (r.post_url && r.post) {
        if (r.post_url instanceof Array) {
            r.post_url.forEach(function(u) {
                app.post(u, r.post);
            });
        }
        else {
            app.post(r.post_url, r.post);
        }
    }
});


var server = http.createServer(app);


if (process.env.MONGOLAB_URI) {
    mongoose.connect(process.env.MONGOLAB_URI);
}
else {
    mongoose.connect('mongodb://localhost/markdown_chat');
}
var Say = mongoose.model('Say');


// settings for socket.io
var io = require('socket.io').listen(server);

io.configure(function() {
    io.set("transports", ["xhr-polling"]); 
    io.set("polling duration", 10); 

});

server.listen(app.get('port'), function(){
  console.log('express server listening on port ' + app.get('port'));
});

io.sockets.on('connection', function(socket) {

	// 初回接続時の履歴取得
	socket.on('msg update', function() {
		Say.find(function(err, docs) {
			socket.emit('msg open', docs.map(function(doc) {
                return {
                    html: doc.renderWithEJS(),
                    date: doc.date,
                    _id: doc._id
                };
            }));
		});
	});

	// when received message
	socket.on('msg send', function(data) {
      var now = new Date(); // now
      var say = new Say({
          name: data.name,
          date: now,
          raw_markdown: data.msg,
          message: data.message
      });
      say.renderMarkdown()
          .then(function(rendered_html) {
              var send_data = {
                  html: rendered_html,
                  date: now,
                  _id: say._id
              };
              socket.emit('msg push', send_data);
              data['markdown'] = rendered_html;
              data["date"] = now;
              socket.broadcast.emit('msg push', send_data);
          }, function(err) {
          })
  });

	// delete from database
	socket.on('deleteDB', function() {
		socket.emit('db drop');
		socket.broadcast.emit('db drop');
		Say.find().remove();
	});

	socket.on('disconnect', function() {
		console.log('disconnected.');
	});
});
