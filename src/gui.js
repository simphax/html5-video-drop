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

$(window).on('dragstart', function() {
	e.preventDefault();
	return false;
});

$(window).on('dragenter', function(e) {
	e.preventDefault();
	return false;
});
$(window).on('dragover', function(e) {
	e.preventDefault();
	return false;
});
$(window).on('drop', function(e) {
	e.preventDefault();
	return false;
});

var droparea = $('.droparea');

$('body').on('dragenter', function(e) {
	var type = e.originalEvent.dataTransfer.files[0].type || null;
	if (type.substr(0, 5) == 'video') {
		$('body').addClass('dropping');
		return false;
	} else {
		$('body').addClass('dropping-wrong');
		return true;
	}
});

$('body').on('dragover', function(e) {
	return false;
});

$('body').on('dragleave', function(e) {
	console.log('dragleave');
	// Check the mouseEvent coordinates are outside of the rectangle
	if (e.originalEvent.x > $(this).offset().left + $(this).width() || e.originalEvent.x <= $(this).offset().left || e.originalEvent.y > $(this).offset().top + $(this).height() || e.originalEvent.y <= $(this).offset().top) {
		$('body').removeClass('dropping');
		$('body').addClass('dropping-wrong');
		return false;
	}
	return true;
});

$('body').on('drop', function(e) {
	console.log('drop');
	console.dir(e);
	e.preventDefault();

	$('body').removeClass('dropping');
	$('body').addClass('dropping-wrong');

	var type = e.originalEvent.dataTransfer.files[0].type || null;
	if (type.substr(0, 5) == 'video') {
		$('body').addClass('dropped');
		$('body').removeClass('loaded');

		droppedFile = e.originalEvent.dataTransfer.files[0];
		console.log(droppedFile);
		$('.filename').html(droppedFile.name);

		getVideoMeta(droppedFile.path, function(err, meta) {
			if (err) {
				console.log('Could not get file meta');
				$('body').removeClass('dropped');
				return;
			}

			droppedVideoMeta = meta;
			generateThumbnails(droppedFile.path, function(err, files) {
				setThumbnails(files);
				showSettings();
			});
		});

		return false;
	} else {
		return true;
	}
});

var thumbnails = [];

var setThumbnails = function(files) {
	thumbnails = files;
}

var showSettings = function() {
	var hoverThumb = 0;
	var selectedThumb = 0;

	$('body').removeClass('dropped');
	$('body').addClass('loaded');
	$('.droparea-thumbnails img').attr('src', thumbnails[0]);
	$('.droparea-thumbselect').on('mousemove', function(e) {
		var relX = e.pageX - $(this).offset().left;
		var width = $(this).outerWidth();
		hoverThumb = Math.floor((relX / width) * numThumbs);
		console.log(hoverThumb);
		hoverThumb = hoverThumb < 0 ? 0 : hoverThumb;
		hoverThumb = hoverThumb > numThumbs ? numThumbs : hoverThumb;
		$(this).find('.droparea-thumbselect-line').css('left', hoverThumb * (width / (numThumbs - 1)) + 'px');
		$('.droparea-thumbnails img').attr('src', thumbnails[hoverThumb]);
	});
	$('.droparea-thumbselect').on('mouseleave', function(e) {
		console.log('mouseleave');
		var width = $(this).outerWidth();
		$(this).find('.droparea-thumbselect-cursor').css('left', selectedThumb * (width / (numThumbs - 1)) + 'px');
		$(this).find('.droparea-thumbselect-line').css('left', selectedThumb * (width / (numThumbs - 1)) + 'px');
		$('.droparea-thumbnails img').attr('src', thumbnails[selectedThumb]);
	});

	$('.droparea-thumbselect').on('click', function(e) {
		var width = $(this).outerWidth();
		selectedThumb = hoverThumb;
		$(this).find('.droparea-thumbselect-cursor').css('left', selectedThumb * (width / (numThumbs - 1)) + 'px');

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
			var thumbGap = droppedVideoMeta.format.duration / (numThumbs - 1);

			async.times(numThumbs, function(i, callback) {
				/* to not completely lock up the main thread we do some setTimeout */
				setTimeout(function() {
					var thumbsPath = thumbsDir + '/thumb' + i + '.jpg';
					console.log('Saving thumbs to ' + thumbsPath);
					var thumbffm = ffmpeg().outputOptions(['-ss', i * thumbGap, '-i', videoFile, '-qscale:v', '1', '-vframes', '1']);
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
				}, i * 100);
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
$('.convertbtn').on('click', function() {
	$(this).addClass('inprogress');
	if (conversionOngoing) {
		ffm.kill(); //Will generate an error
		conversionOngoing = false;
	} else if (!conversionOngoing && droppedFile) {

		$(this).find('.progressbutton-text').html('Converting...');
		conversionOngoing = true;
		var size = '800x800';

		ffm = ffmpeg(droppedFile.path).outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-preset', 'fast', '-crf', '18', '-f', 'mp4']);
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

			$('.convertbtn').find('.progressbutton-bar').css('width', progress.percent + '%');
		});

		ffm.on('error', function(err, stdout, stderr) {
			err.stderr = stderr;
			console.log(err);
			conversionOngoing = false;
			$('.convertbtn').find('.progressbutton-text').html('CONVERT');
			$('.convertbtn').find('.progressbutton-bar').css('width', '0%');
			$('.convertbtn').removeClass('inprogress');
		});

		ffm.on('end', function() {
			console.log('End!');
			conversionOngoing = false;
			$('.convertbtn').find('.progressbutton-text').html('CONVERT');
			$('.convertbtn').find('.progressbutton-bar').css('width', '0%');
			$('.convertbtn').removeClass('inprogress');
			//callback();
		});

		ffm.run();
	}
});

$('.convertbtn').on('mouseenter', function() {
	if (conversionOngoing) {
		$(this).find('.progressbutton-text').html('STOP');
	}
});
$('.convertbtn').on('mouseleave', function() {
	if (conversionOngoing) {
		$(this).find('.progressbutton-text').html('Converting...');
	}
});

$('.select').each(function() {
	var parent = $(this);
	$(this).find('.select-item').on('click', function() {
		console.log('select item click');
		parent.find('.select-item').removeClass('select-item-selected');
		$(this).addClass('select-item-selected');
	});
});

$('.slideselect').each(function() {
	var parent = $(this);
	$(this).find('.slideselect-item').on('click', function() {
		console.log('slideselect item click');
		parent.find('.slideselect-item').removeClass('slideselect-item-selected');
		$(this).addClass('slideselect-item-selected');

		var offsetLeft = $(this).offset().left - $(this).parent().offset().left;
		parent.find('.slideselect-cursor').css('left', offsetLeft + 'px');
		var offsetTop = $(this).offset().top - $(this).parent().offset().top;
		parent.find('.slideselect-cursor').css('top', offsetTop + 'px');
	});
});
