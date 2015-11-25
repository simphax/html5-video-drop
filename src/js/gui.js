var nwgui = require('nw.gui');
var async = require('async');

var fs = require('fs');
var ffmpeg_dl = require('ffmpeg-static');
var ffprobe_dl = require('ffprobe-static');
var ffmpeg = require('fluent-ffmpeg');

var setupFfmpeg = function() {
	fs.chmodSync(ffmpeg_dl.path, 0777);
	fs.chmodSync(ffprobe_dl.path, 0777);
	ffmpeg.setFfmpegPath(ffmpeg_dl.path);
	ffmpeg.setFfprobePath(ffprobe_dl.path);
}

setupFfmpeg();

var droppedFile;
var droppedVideoMeta;
var fileDropped = false;
var conversionOngoing = false;
var thumbsDir = nwgui.App.dataPath + '/tmp';
var numThumbs = 9;


$(window).on('dragover', function(e) {
	e.preventDefault();
	return false;
});
$(window).on('drop', function(e) {
	e.preventDefault();
	return false;
});

var droparea = $('.droparea');

droparea.on('dragover', function() {
	$(this).addClass('dropping');
	return false;
});

droparea.on('dragleave', function() {
	$(this).removeClass('dropping');
	return false;
});

droparea.on('drop', function(e) {
	e.preventDefault();

	droppedFile = e.originalEvent.dataTransfer.files[0];
	console.log(droppedFile);
	$('.filename').html(droppedFile.name);

	$(this).addClass('dropped');

	var theDroparea = $(this);
	getVideoMeta(droppedFile.path, function(err, meta) {
		if (err) {
			console.log('Could not get file meta');
			theDroparea.removeClass('dropped');
			return;
		}

		droppedVideoMeta = meta;
		generateThumbnails(droppedFile.path, function(err, files) {
			setThumbnails(files);
			showSettings();
		});
	});

	return false;
});

var thumbnails = [];

var setThumbnails = function(files) {
	thumbnails = files;
}

var showSettings = function() {
	droparea.addClass('thumbnails');
	droparea.css('background-image', 'url(\'' + thumbnails[0] + '\')');
	droparea.on('mousemove', function(e) {
		var relX = e.pageX - $(this).offset().left;
		var width = $(this).outerWidth();
		var steps = Math.floor((relX / width) * numThumbs);
		console.log(steps);
		steps = steps < 0 ? 0 : steps;
		steps = steps > numThumbs ? numThumbs : steps;

		$(this).css('background-image', 'url(\'' + thumbnails[steps] + '\')');
	});
}

var getVideoMeta = function(videoFile, callback) {
	var thumbffm = ffmpeg.ffprobe(videoFile, function(err, metadata) {
		console.dir(metadata);
		if (err) {
			console.log(err);
			return callback(err);
		}
		callback(null, metadata);
	});
}
var generateThumbnails = function(videoFile, callback) {
	fs.mkdir(nwgui.App.dataPath + '/tmp', function(err) {
		if (!err || (err && err.code === 'EEXIST')) {
			var thumbGap = droppedVideoMeta.format.duration / numThumbs;
			async.times(numThumbs, function(i, callback) {
				var thumbsPath = thumbsDir + '/thumb' + i + '.jpg';
				console.log('Saving thumbs to ' + thumbsPath);
				var thumbffm = ffmpeg().outputOptions(['-ss', i * thumbGap, '-i', videoFile, '-qscale:v', '5', '-vframes', '1']);
				thumbffm.output(thumbsPath);
				thumbffm.on('error', function(err, stdout, stderr) {
					err.stderr = stderr;
					console.log(err);
					callback(err);
				});
				thumbffm.on('end', function() {
					console.log('Done generating thumbnails');
					callback(null, thumbsPath);
				});
				thumbffm.run();
			}, function(err, files) {
				if (err) {
					return callback(err);
				}
				callback(null, files);
			});
		} else {
			console.log(err);
			callback(new Error('Could not create temp folder'));
		}
	});
}

var scale = function(width, height) {
	return 'scale=trunc(iw*min(' + width + '/iw\\,' + height + '/ih)/2)*2:trunc(ih*min(' + width + '/iw\\,' + height + '/ih)/2)*2';
}

var ffm;
$('.convert-btn').on('click', function() {
	if (conversionOngoing) {
		ffm.kill();
		conversionOngoing = false;
		$(this).html('CONVERT');
	} else if (!conversionOngoing && droppedFile) {
		conversionOngoing = true;
		$(this).html('STOP');
		var size = '800x800';

		ffm = ffmpeg(droppedFile.path).outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-preset', 'fast', '-crf', '18', '-f', 'mp4', '-ss', '30', '-t', '4']);
		ffm.on('start', function(commandLine) {
			console.log('Spawned Ffmpeg with command: ' + commandLine);
		});
		var match;
		if (match = size.match(/(\d+)x(\d+)/)) {
			ffm.addOutputOptions('-vf', scale(match[1], match[2]));
		} else {
			ffm.size(size);
		}

		ffm.output('/Users/Simon/Desktop/cool.m4v');

		ffm.on('progress', function(progress) {
			console.log('Processing: ' + progress.percent + '% done');

			$('.progress-mp4 .progress-bar').css('width', progress.percent + '%');
		});

		ffm.on('error', function(err, stdout, stderr) {
			err.stderr = stderr;
			console.log(err);
			conversionOngoing = false;
		});

		ffm.on('end', function() {
			console.log('End!');
			conversionOngoing = false;
			//callback();
		});

		ffm.run();
	}
});
