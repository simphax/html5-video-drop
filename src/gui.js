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
	if (e.originalEvent.dataTransfer.files.length > 0) {
		var type = e.originalEvent.dataTransfer.files[0].type || null;
		e.originalEvent.dataTransfer.dropEffect = 'copy';
		if (type.substr(0, 5) == 'video') {
			$('body').addClass('dropping');
			return false;
		} else {
			$('body').addClass('dropping-wrong');
			return true;
		}
	}
});

$('body').on('dragover', function(e) {
	e.originalEvent.dataTransfer.dropEffect = 'copy';
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

var expandFinish = function() {
	var offset = $('.convertbtn').offset();
	var width = $('.convertbtn').outerWidth();
	var height = $('.convertbtn').outerHeight();
	console.log(offset);
	console.log(width);
	console.log(height);
	$('.finish-bg').css('left', offset.left + 'px');
	$('.finish-bg').css('top', offset.top + 'px');
	$('.finish-bg').css('width', width + 'px');
	$('.finish-bg').css('height', '0px');
	setTimeout(function() {
		$('.finish').addClass('expanded');	
		$('.finish-bg').addClass('expanded');
		$('.finish-bg').css('left', 0 + 'px');
		$('.finish-bg').css('top', 0 + 'px');
		$('.finish-bg').css('width', '100%');
		$('.finish-bg').css('height', '300%');
	}, 100);
}

var closeFinish = function() {
	$('.finish').removeClass('expanded');
	$('.finish-bg').removeClass('expanded');
	$('.finish-bg').css('left', '0px');
	$('.finish-bg').css('top', '0px');
	$('.finish-bg').css('width', '0px');
	$('.finish-bg').css('height', '0px');
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

var vFrameCount = function(metadata) {
	var frameCount = 0;
	metadata.streams.forEach(function(stream) {
		if (stream.codec_type == 'video') {
			frameCount = stream.nb_frames;
		}
	});
	return frameCount;
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
					var ss = i * thumbGap;
					var thumbffm;
					ss = ss >= droppedVideoMeta.format.duration ? Math.floor(droppedVideoMeta.format.duration) : ss;
					/*
					if (ss == droppedVideoMeta.format.duration) {
						console.log(ss);
						var frameCount = vFrameCount(droppedVideoMeta);
						console.log('last frame');
						console.log('frameCount: ',frameCount);
						thumbffm = ffmpeg().outputOptions(['-i', videoFile, '-vf', 'select=\'eq(n,' + (frameCount - 1) + ')\'', '-qscale:v', '1', '-vframes', '1']);
					} else {
						thumbffm = ffmpeg().outputOptions(['-ss', ss, '-i', videoFile, '-qscale:v', '1', '-vframes', '1']);
					}
					*/
					thumbffm = ffmpeg().outputOptions(['-ss', ss, '-i', videoFile, '-qscale:v', '1', '-vframes', '1']);
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
			expandFinish();
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
	var select = $(this);
	$(this).find('.select-item').on('click', function() {
		console.log('select item click');
		select.find('.select-item').removeClass('select-item-selected');
		$(this).addClass('select-item-selected');
	});
});

$('.multiselect').each(function() {
	var multiselect = $(this);
	$(this).find('.multiselect-item').on('click', function() {
		var multiselectItem = $(this);
		if (!$(this).hasClass('selected')) {
			$(this).addClass('selected');
			multiselect.find('input.multiselect-input').each(function() {
				var value = multiselectItem.data('value');
				var values = $(this).attr('value');
				values = values ? values.split(',') : [];
				values.push(value);
				console.log(values);
				$(this).attr('value', values.join(','));
			});
		} else {
			$(this).removeClass('selected');
			multiselect.find('input.multiselect-input').each(function() {
				var value = multiselectItem.data('value');
				var values = $(this).attr('value');
				values = values ? values.split(',') : [];
				var index = values.indexOf(value);
				if (index > -1) {
					values.splice(index, 1);
				}
				console.log(values);
				$(this).attr('value', values.join(','));
			});
		}
	});
});

$('.slideselect').each(function() {
	var slideselect = $(this);
	$(this).find('.slideselect-item').on('click', function() {
		console.log('slideselect item click');
		slideselect.find('.slideselect-item').removeClass('slideselect-item-selected');
		$(this).addClass('slideselect-item-selected');

		var offsetLeft = $(this).offset().left - $(this).parent().offset().left;
		slideselect.find('.slideselect-cursor').css('left', offsetLeft + 'px');
		var offsetTop = $(this).offset().top - $(this).parent().offset().top;
		slideselect.find('.slideselect-cursor').css('top', offsetTop + 'px');
	});
});

$('.tabview-tabs').find('.tabview-tab').each(function(tabIndex) {
	console.log('tab ', tabIndex);
	$(this).on('click', function() {
		$('.tabview-tabs').find('.tabview-tab').removeClass('selected');
		$(this).addClass('selected');
		$('.tabview-pages').find('.tabview-page').each(function(pageIndex) {
			if (pageIndex == tabIndex) {
				$(this).addClass('visible');
			} else {
				$(this).removeClass('visible');
			}
		});
	});

});

$('.finish-file-draggable-mp4').on('dragstart', function(e) {
	console.log('dragstart file');
	e.originalEvent.dataTransfer.setData("DownloadURL", "video/mp4:video.mp4:file:///Users/Simon/Desktop/big_buck_bunny.mp4");
	e.originalEvent.dataTransfer.effectAllowed = 'copy';
	return true;
});
$('.finish-file-draggable-webm').on('dragstart', function(e) {
	console.log('dragstart file');
	e.originalEvent.dataTransfer.setData("DownloadURL", "video/webm:video.webm:file:///Users/Simon/Desktop/big_buck_bunny.webm");
	e.originalEvent.dataTransfer.effectAllowed = 'copy';
	return true;
});
$('.finish-file-draggable-thumb').on('dragstart', function(e) {
	console.log('dragstart file');
	e.originalEvent.dataTransfer.setData("DownloadURL", "image/jpeg:thumbnail.jpg:file:///Users/Simon/Desktop/thumb0.jpg");
	e.originalEvent.dataTransfer.effectAllowed = 'copy';
	return true;
});

var codeBlock = $('.finish-code pre code');
hljs.highlightBlock(codeBlock.get(0));

setTimeout(function() {
	expandFinish();
}, 1000);

$('.finish-close-button').on('click', function() {
	console.log('close button');
	closeFinish();
});
