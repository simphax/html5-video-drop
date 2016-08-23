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
var tempDir = nwgui.App.dataPath + '/tmp';
var videoDir = tempDir;
var mp4Path = videoDir + '/video.mp4';
var webmPath = videoDir + '/video.webm';
var numThumbs = 9;

var videoResolution = {
    width: 1920,
    height: 1080
};
var videoRatio = 16 / 9;

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
            console.log("Dropped video meta: ", droppedVideoMeta);
            updateVideoMeta();
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
    var heightPercentage = ($('.convertbtn').outerHeight() / $('body').outerHeight()) * 100;
    console.log(offset);
    console.log(width);
    console.log(heightPercentage);
    $('.finish').css('transition', 'all 0s');
    $('.finish').css('transition-timing-function', 'ease-in-out');
    $('.finish').css('left', offset.left + 'px');
    $('.finish').css('top', offset.top + 'px');
    $('.finish').css('width', width + 'px');
    $('.finish').css('min-height', Math.floor(heightPercentage) + '%');
    $('.finish').css('max-height', Math.floor(heightPercentage) + '%');
    $('.finish').css('opacity', '0.0');
    setTimeout(function() {
        $('.finish').css('transition', 'all 0.1s');
        $('.finish').css('transition-timing-function', 'ease-in-out');
        $('.finish').css('opacity', '1.0');
    }, 100);

    setTimeout(function() {
        $('.finish').addClass('expanded');
        $('.finish').css('transition', 'all 0.3s');
        $('.finish').css('transition-timing-function', 'ease-in-out');
        $('.finish').css('left', 0 + 'px');
        $('.finish').css('top', 0 + 'px');
        $('.finish').css('width', '100%');
        $('.finish').css('min-height', '100%');
        $('.finish').css('max-height', '400%');
    }, 150);
}

var closeFinish = function() {
    $('.finish').removeClass('expanded');
    var offset = $('.convertbtn').offset();
    var width = $('.convertbtn').outerWidth();
    var height = $('.convertbtn').outerHeight();
    var heightPercentage = ($('.convertbtn').outerHeight() / $('body').outerHeight()) * 100;
    console.log(offset);
    console.log(width);
    console.log(heightPercentage);
    $('.finish').css('transition', 'all 0.2s');
    $('.finish').css('transition-timing-function', 'ease-in-out');
    $('.finish').css('left', offset.left + 'px');
    $('.finish').css('top', offset.top + 'px');
    $('.finish').css('width', width + 'px');
    $('.finish').css('min-height', Math.floor(heightPercentage) + '%');
    $('.finish').css('max-height', Math.floor(heightPercentage) + '%');
    setTimeout(function() {
        $('.finish').css('transition', 'all 0.1s');
        $('.finish').css('transition-timing-function', 'ease-in-out');
        $('.finish').css('opacity', '0.0');
    }, 150);
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

var vResolution = function(metadata) {
    var resolution;
    metadata.streams.forEach(function(stream) {
        if (stream.codec_type == 'video') {
            resolution = {
                width: stream.width,
                height: stream.height,
            };
        }
    });
    return resolution;
}

var updateVideoMeta = function() {
    videoResolution = {
        width: 1920,
        height: 1080
    };
    videoRatio = 16 / 9;
    if (droppedVideoMeta) {
        videoResolution = vResolution(droppedVideoMeta);
        if (videoResolution) {
            videoRatio = videoResolution.width / videoResolution.height;
        }
    }

    $('.resinput-width').val(videoResolution.width);
    $('.resinput-height').val(videoResolution.height);

    updateOutputResolution();
}

var generateThumbnails = function(videoFile, callback) {
    fs.mkdir(tempDir, function(err) {
        if (!err || (err && err.code === 'EEXIST')) {
            var thumbGap = droppedVideoMeta.format.duration / (numThumbs - 1);

            async.times(numThumbs, function(i, callback) {
                /* to not completely lock up the main thread we do some setTimeout */
                setTimeout(function() {
                    var thumbsPath = tempDir + '/thumb' + i + '.jpg';
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
                    
                    thumbffm = ffmpeg();//.outputOptions(['-ss', ss, '-i', videoFileEscaped, '-qscale:v', '1', '-vframes', '1']);
                    
                    
                    thumbffm.input(videoFile);
                    thumbffm.inputOptions(['-ss', ss]);
                    thumbffm.output(thumbsPath);
                    thumbffm.outputOptions(['-qscale:v', '1','-vframes', '1']);
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

var ffm_mp4;
var ffm_webm;
$('.convertbtn').on('click', function() {
    $(this).addClass('inprogress');
    if (conversionOngoing) {
        ffm_mp4.kill(); //Will generate an error
        ffm_webm.kill(); //Will generate an error
        conversionOngoing = false;
    } else if (!conversionOngoing && droppedFile) {

        $(this).find('.progressbutton-text').html('Converting...');
        conversionOngoing = true;
        var size = ''; //'800x800';

        ffm_mp4 = ffmpeg(droppedFile.path).outputOptions(['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-preset', 'fast', '-crf', '18', '-f', 'mp4']);
        ffm_webm = ffmpeg(droppedFile.path).outputOptions(['-c:v', 'libvpx', '-pix_fmt', 'yuv420p', '-c:a', 'libvorbis', '-quality', 'good', '-threads', '6', '-b:v', '2M', '-crf', '5', '-f', 'webm']);
        //['-c:v', 'libvpx', '-pix_fmt', 'yuv420p', '-c:a', 'libvorbis', '-quality', 'good', '-b:v', '2M', '-crf', '5', '-f', 'webm']
        /*ffm.on('start', function(commandLine) {
					console.log('Spawned Ffmpeg with command: ' + commandLine);
				});
				var match;
				if (match = size.match(/(\d+)x(\d+)/)) {
					ffm.addOutputOptions('-vf', scale(match[1], match[2]));
				} else {
					//ffm.size(size);
				}
*/
        ffm_mp4.output(mp4Path);
        ffm_webm.output(webmPath);

        //Webm is the one who takes the longest time so it could be the one setting the progress.
        ffm_webm.on('progress', function(progress) {
            console.log(progress)
            console.log('Processing: ' + progress.percent + '% done');

            $('.convertbtn').find('.progressbutton-bar').css('width', progress.percent + '%');
        });

        ffm_mp4.on('error', function(err, stdout, stderr) {
            err.stderr = stderr;
            console.log(err);
            conversionOngoing = false;
            $('.convertbtn').find('.progressbutton-text').html('CONVERT');
            $('.convertbtn').find('.progressbutton-bar').css('width', '0%');
            $('.convertbtn').removeClass('inprogress');
        });

        ffm_webm.on('error', function(err, stdout, stderr) {
            err.stderr = stderr;
            console.log(err);
            conversionOngoing = false;
            $('.convertbtn').find('.progressbutton-text').html('CONVERT');
            $('.convertbtn').find('.progressbutton-bar').css('width', '0%');
            $('.convertbtn').removeClass('inprogress');
        });

        ffm_mp4.on('end', function() {
            console.log('MP4 conversion is done');
        });

        ffm_webm.on('end', function() {
            console.log('WEBM conversion is done');
            conversionOngoing = false;
            $('.convertbtn').find('.progressbutton-text').html('CONVERT');
            $('.convertbtn').find('.progressbutton-bar').css('width', '0%');
            $('.convertbtn').removeClass('inprogress');

            $('.ms-videoproperties').trigger('change'); //Regenerate video preview
            expandFinish();
            //callback();
        });

        ffm_mp4.run();
        ffm_webm.run();

        //expandFinish();
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
                var values = $(this).val();
                values = values ? values.split(',') : [];
                values.push(value);
                console.log(values);
                $(this).val(values.join(','));
                $(this).trigger('change');
            });
        } else {
            $(this).removeClass('selected');
            multiselect.find('input.multiselect-input').each(function() {
                var value = multiselectItem.data('value');
                var values = $(this).val();
                values = values ? values.split(',') : [];
                var index = values.indexOf(value);
                if (index > -1) {
                    values.splice(index, 1);
                }
                console.log(values);
                $(this).val(values.join(','));
                $(this).trigger('change');
            });
        }
    });
});

$('.slideselect').each(function() {
    var slideselect = $(this);

    slideselect.updateCursorPosition = function() {
        var selectedItem = $(this).find('.slideselect-item.slideselect-item-selected').first();

        slideselect.find('.slideselect-cursor').show();
        var offsetLeft = selectedItem.offset().left - selectedItem.parent().offset().left;
        slideselect.find('.slideselect-cursor').css('left', offsetLeft + 'px');
        var offsetTop = selectedItem.offset().top - selectedItem.parent().offset().top;
        slideselect.find('.slideselect-cursor').css('top', offsetTop + 'px');

    }

    slideselect.find('.slideselect-item').on('click', function() {
        console.log('slideselect item click');
        slideselect.find('.slideselect-item').removeClass('slideselect-item-selected');
        $(this).addClass('slideselect-item-selected');

        slideselect.updateCursorPosition()

        var value = $(this).data('value');
        slideselect.find('.slideselect-input').val(value);
        slideselect.find('.slideselect-input').trigger('change');
    });

    $(window).on('resize', function(){
        slideselect.updateCursorPosition()
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
    e.originalEvent.dataTransfer.setData("DownloadURL", "video/mp4:video.mp4:file://" + mp4Path);
    e.originalEvent.dataTransfer.effectAllowed = 'copy';
    return true;
});
$('.finish-file-draggable-webm').on('dragstart', function(e) {
    console.log('dragstart file');
    e.originalEvent.dataTransfer.setData("DownloadURL", "video/webm:video.webm:file://" + webmPath);
    e.originalEvent.dataTransfer.effectAllowed = 'copy';
    return true;
});
$('.finish-file-draggable-thumb').on('dragstart', function(e) {
    console.log('dragstart file');
    e.originalEvent.dataTransfer.setData("DownloadURL", "image/jpeg:thumbnail.jpg:file://" + tempDir + "/thumb0.jpg");
    e.originalEvent.dataTransfer.effectAllowed = 'copy';
    return true;
});

var codeBlock = $('.finish-code pre code');
hljs.highlightBlock(codeBlock.get(0));

setTimeout(function() {
    //expandFinish();
}, 1000);

$('.finish-close-button').on('click', function() {
    console.log('close button');
    closeFinish();
});

$('.ms-videoproperties').on('change', function() {
    var values = $(this).val();
    values = values ? values.split(',') : [];
    console.log('videoproperties change', values);

    var videoHTMLPreview = generateVideoHTMLPreview(values);
    var videoHTMLCode = generateVideoHTMLCode(values);

    $("#videoHTMLPreview").html(videoHTMLPreview);
    $("#videoHTMLCode").html(videoHTMLCode);
    hljs.highlightBlock($("#videoHTMLCode").get(0));
});

var generateVideoHTMLPreview = function(attribs) {
    var controls = attribs.indexOf('controls') != -1 ? ' controls' : '';
    var responsive = attribs.indexOf('responsive') != -1 ? ' style="width: 100%; height: auto;"' : '';
    var muted = attribs.indexOf('muted') != -1 ? ' volume="0" muted' : '';
    var loop = attribs.indexOf('loop') != -1 ? ' loop' : '';
    var nopreload = attribs.indexOf('preload-none') != -1 ? ' preload="none"' : '';
    var autoplay = attribs.indexOf('autoplay') != -1 ? ' autoplay' : '';

    return '<video preload="metadata" poster="' + tempDir + '/thumb0.jpg" ' + controls + responsive + muted + loop + nopreload + autoplay + '>\
	<source src="' + mp4Path + '" type="video/mp4" />\
<source src="' + webmPath + '" type="video/webm" />\
</video>';
}

var generateVideoHTMLCode = function(attribs) {
    var controls = attribs.indexOf('controls') != -1 ? ' controls' : '';
    var responsive = attribs.indexOf('responsive') != -1 ? ' style="width: 100%; height: auto;"' : '';
    var muted = attribs.indexOf('muted') != -1 ? ' volume="0" muted' : '';
    var loop = attribs.indexOf('loop') != -1 ? ' loop' : '';
    var nopreload = attribs.indexOf('preload-none') != -1 ? ' preload="none"' : '';
    var autoplay = attribs.indexOf('autoplay') != -1 ? ' autoplay' : '';

    return '&lt;video poster="thumbnail.jpg"' + responsive + controls + muted + loop + nopreload + autoplay + '>\r\n\
	&lt;source src="video.mp4" type="video/mp4" />\r\n\
	&lt;source src="video.webm" type="video/webm" />\r\n\
	&lt;p>Sorry, your browser does not support HTML5 video&lt;/p>\r\n\
&lt;/video>';
}

$('.ss-resolution').on('change', function() {
    var value = $(this).val();
    var videoResolution = {
        width: 1920,
        height: 1080
    };
    var targetResolution = {
        width: 1920,
        height: 1080
    };
    var videoRatio = 16 / 9;
    if (droppedVideoMeta) {
        videoResolution = vResolution(droppedVideoMeta);
        if (videoResolution) {
            videoRatio = videoResolution.width / videoResolution.height;
        }
    }

    switch (value) {
        case '4k':
            targetResolution = {
                width: 3840,
                height: 2160
            };
            break;
        case '1080p':
            targetResolution = {
                width: 1920,
                height: 1080
            };
            break;
        case '720p':
            targetResolution = {
                width: 1280,
                height: 720
            };
            break;
        case '480p':
            targetResolution = {
                width: 858,
                height: 480
            };
            break;
        case '360p':
            targetResolution = {
                width: 480,
                height: 360
            };
            break;
        case '240p':
            targetResolution = {
                width: 352,
                height: 240
            };
            break;
        default:
        case 'original':
            targetResolution = videoResolution;
            break;
    }

    $('.resinput-width').val(targetResolution.width);
    $('.resinput-width').trigger('change');
    $('.resinput-height').val(targetResolution.height);
    $('.resinput-height').trigger('change');
});

$('.resinput-width').on('keyup', function() {
    console.log('a');
    $('.slideselect-res').find('.slideselect-cursor').hide();
    $('.slideselect-res').find('.slideselect-item-selected').removeClass('slideselect-item-selected');
    this.value = this.value.replace(/[^0-9\.]/g, '');
    updateOutputResolution();
    /*var widthInt = parseInt(this.value);
    if (widthInt) {
    	$('.resinput-height').val(widthInt / videoRatio);
    }*/
});

$('.resinput-height').on('keyup', function() {
    $('.slideselect-res').find('.slideselect-cursor').hide();
    $('.slideselect-res').find('.slideselect-item-selected').removeClass('slideselect-item-selected');
    this.value = this.value.replace(/[^0-9\.]/g, '');
    updateOutputResolution();
    /*var heightInt = parseInt(this.value);
    if (heightInt) {
    	$('.resinput-width').val(heightInt * videoRatio);
    }*/
});

$('.resinput-width').on('change', function() {
    console.log('b');
    updateOutputResolution();
});
$('.resinput-height').on('change', function() {
    updateOutputResolution();
});

var updateOutputResolution = function() {
    var maxWidth = $('.resinput-width').val();
    var maxHeight = $('.resinput-height').val();

    var outputWidth = maxWidth;
    var outputHeight = maxHeight;

    if (videoResolution.width > videoResolution.height) {
        outputHeight = maxWidth / videoRatio;
    } else {
        outputWidth = maxHeight * videoRatio;
    }

    $('.resoutput-width').val(parseInt(outputWidth));
    $('.resoutput-height').val(parseInt(outputHeight));
}
