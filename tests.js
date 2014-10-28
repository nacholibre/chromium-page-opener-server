(function() {
    'use strict';

    var express = require('express');
    var io = require('socket.io-client');
    var spawn = require('child_process').spawn;
    var async = require('async');
    var chai = require('chai');
    var expect = chai.expect;

    var app = express();

    var options = {
        'force new connection': true
    };

    var socketURL = 'http://localhost:3000';

    app.get('/load_for/:seconds', function (req, res) {
        var seconds = req.params.seconds || 1;

        setTimeout(function() {
            res.send('Hello!');
        }, seconds*1000);
    });

    app.listen(8080);

    describe('ChromiumPOS', function() {
        this.timeout(60000);

        before(function(done) {
            var screenshotServer = spawn('xvfb-run', ['-a', './node_modules/nodewebkit/nodewebkit/nw', 'nw-app']);

            screenshotServer.stdout.on('data', function (data) {
                console.log('nw-app stdout: ' + data);

                if (data.toString().indexOf('APPINIT') !== -1) {
                    //APPINIT is actually a console.log('APPINIT') from the
                    //node webkit application. We found it in stdout meaning
                    //the application has started and its ready
                    done();
                }
            });

            screenshotServer.stderr.on('data', function (data) {
                console.log('nw-app stderr: ' + data);
            });
        });

        after(function() {
            spawn('killall', ['nw', 'xvfb']);
        });

        it('should openURL and return data', function(done) {
            var client = io.connect(socketURL, options);
            client.on('connect', function() {
                client.emit('openURL', {url: 'http://localhost:8080/load_for/1'}, function(data) {
                    expect(data.pageLoadTimeMS).to.be.within(1000, 1500);
                    done();
                });
            });
        });

        it('should hit the timeout', function(done) {
            var client = io.connect(socketURL, options);

            client.on('connect', function() {
                client.emit('openURL', {url: 'http://localhost:8080/load_for/2', 'timeout': 1}, function(data) {
                    expect(data.pageLoadTimeMS).to.be.null;
                    expect(data.loaded).to.be.false;
                    done();
                });
            });
        });

        it('should open urls in parallel', function(done) {
            var client = io.connect(socketURL, options);

            client.on('connect', function() {
                var started = new Date();

                async.parallel([
                function(fDone) {
                    client.emit('openURL', {url: 'http://localhost:8080/load_for/1'}, function(data) {
                        expect(data.pageLoadTimeMS).to.be.within(1000, 1500);
                        fDone();
                    });
                }, function(fDone) {
                    client.emit('openURL', {url: 'http://localhost:8080/load_for/2'}, function(data) {
                        expect(data.pageLoadTimeMS).to.be.within(2000, 2500);
                        fDone();
                    });
                }, function(fDone) {
                    client.emit('openURL', {url: 'http://localhost:8080/load_for/2', timeout: 1}, function(data) {
                        expect(data.loaded).to.be.false;
                        fDone();
                    });
                }], function() {
                    var endedFor = new Date().valueOf() - started.valueOf();
                    expect(endedFor).to.be.within(2000, 3000);
                    done();
                });
            });
        });
    });
})();
