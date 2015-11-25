var fs = require('fs');
var ffmpeg_dl = require('ffmpeg-static');
var ffprobe_dl = require('ffprobe-static');
var ffmpeg = require("fluent-ffmpeg");

var setupFfmpeg = function() {
	fs.chmodSync(ffmpeg_dl.path, 0777);
	fs.chmodSync(ffprobe_dl.path, 0777);
	ffmpeg.setFfmpegPath(ffmpeg_dl.path);
	ffmpeg.setFfprobePath(ffprobe_dl.path);
}

setupFfmpeg();

var droppedFile;
var fileDropped = false;
var conversionOngoing = false;


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
	/*
		for (var i = 0; i < e.originalEvent.dataTransfer.files.length; ++i) {
			console.log(e.originalEvent.dataTransfer.files[i]);
		}
	*/
	return false;
});

var scale = function(width, height) {
	return "scale=iw*min(" + width + "/iw\\," + height + "/ih):ih*min(" + width + "/iw\\," + height + "/ih)";
}

var ffm;
$('.convert-btn').on('click', function() {
	if(conversionOngoing) {
		ffm.kill();
		conversionOngoing = false;
		$(this).html("CONVERT");
	} else if (!conversionOngoing && droppedFile) {
		conversionOngoing = true;
		$(this).html("STOP");
		var size = "400x400";

		ffm = ffmpeg(droppedFile.path).outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-preset', 'fast', '-crf', '18', '-f', 'mp4']);
		ffm.on('start', function(commandLine) {
			console.log('Spawned Ffmpeg with command: ' + commandLine);
		});
		var match;
		if (match = size.match(/(\d+)x(\d+)/)) {
			ffm.addOutputOptions("-vf", scale(match[1], match[2]));
		} else {
			ffm.size(size);
		}

		ffm.output("/Users/Simon/Desktop/cool.m4v");

		ffm.on('progress', function(progress) {
			console.log('Processing: ' + progress.percent + '% done');

			$('.progress-mp4 .progress-bar').css('width', progress.percent + '%');
		});

		ffm.on("error", function(error, stdout, stderr) {
			error.stderr = stderr;
			console.log(error);
			conversionOngoing = false;
		});

		ffm.on("end", function() {
			console.log('End!');
			conversionOngoing = false;
			//callback();
		});

		ffm.run();
	}
});
