/*
 * grunt-devperf
 * https://github.com/gaelmetais/grunt-devperf
 *
 * Copyright (c) 2014 Gaël Métais
 * Licensed under the MIT license.
 */

/*jslint node: true */
'use strict';

var fs = require('fs');
var path = require('path');

module.exports = function(grunt) {
  require('grunt-phantomas/tasks/phantomas')(grunt);

  grunt.registerTask('devperfAfter', 'Task to run after phantomas', function() {
    
    grunt.task.requires('phantomas');

    var pages = [];
    var options = this.options({});
    options.urls.forEach(function(url) {
      var folderName = sanitizeFolderName(url);

      var page = {
        url : url,
        timingsHistory : [],
        gruntPhantomasReport : folderName + '/index.html'
      };
    
      var pageDataFolder = options.resultsFolder + '/' + folderName + '/data';
      grunt.log.writeln('Looking for result files in ' + pageDataFolder);
      
      var pageJsonFiles = fs.readdirSync(pageDataFolder);

      pageJsonFiles.sort(function(a, b) {
        return parseInt(a, 10) < parseInt(b, 10) ? 1 : -1;
      }).forEach(function(jsonFileName, key) {
        if (jsonFileName.indexOf('.json') === 13) {
          var timestamp = jsonFileName.substring(0, 13);

          var filePath = pageDataFolder + '/' + jsonFileName;
          var content = fs.readFileSync(filePath);
          var json = JSON.parse(content);

          // Avoid problems with the old json file format of grunt-phantomas (before v0.7.0) by ignoring them
          if (json.metrics) {

            // Get all metrics for most recent data
            if (key === 0) {
              for (var metric in json.metrics) {
                page[metric] = json.metrics[metric].average;
              }
            }

            // Get history for each
            page.timingsHistory.push({
              'timestamp': timestamp,
              'timeToFirstByte': json.metrics.timeToFirstByte.average,
              'onDOMReadyTime': json.metrics.onDOMReadyTime.average,
              'windowOnLoadTime': json.metrics.windowOnLoadTime.average,
              'httpTrafficCompleted': json.metrics.httpTrafficCompleted.average
            });

          }
        }
      });

      pages.push(page);
    });

    // Write result file
    fs.writeFileSync(options.resultsFolder + '/results.json', JSON.stringify({pages: pages}, null, 4));
    grunt.log.writeln('File "' + options.resultsFolder + '/results.json' + '" created.');

    // Write settings file for the front
    var settingsFilePath = options.resultsFolder + '/settings.json';
    fs.writeFileSync(settingsFilePath, JSON.stringify(options, null, 4));
    grunt.log.writeln('File "' + settingsFilePath + '" created.');

    // Copy assets
    var frontFilesPath = __dirname + '/front';
    grunt.file.copy(frontFilesPath + '/assets/main.js', options.resultsFolder + '/assets/main.js');
    grunt.file.copy(frontFilesPath + '/assets/main.css', options.resultsFolder + '/assets/main.css');
    grunt.file.copy(frontFilesPath + '/assets/interlace.png', options.resultsFolder + '/assets/interlace.png');
    grunt.file.copy(frontFilesPath + '/assets/handlebars-v1.3.0.js', options.resultsFolder + '/assets/handlebars-v1.3.0.js');
    grunt.file.copy(frontFilesPath + '/assets/jquery-2.1.0.min.js', options.resultsFolder + '/assets/jquery-2.1.0.min.js');
    grunt.file.copy(frontFilesPath + '/assets/highcharts.js', options.resultsFolder + '/assets/highcharts.js');
    grunt.log.writeln('Assets copied.');

    // Write index.html
    var indexHtml = grunt.file.read(frontFilesPath + '/index.html');
    indexHtml = indexHtml.replace('/*%%RESULTS%%*/', 'var results = ' + JSON.stringify({pages: pages}, null, 4));
    indexHtml = indexHtml.replace('/*%%SETTINGS%%*/', 'var settings = ' + JSON.stringify(options, null, 4));
    var indexPath = options.resultsFolder + '/index.html';
    grunt.file.write(indexPath, indexHtml);

    // Open the index.html file in browser (option)
    if (options.openResults) {
      require('grunt-open/tasks/open')(grunt);
      
      // Inject the config into devperfAfter task
      grunt.config.set('open.devperf_auto_task', {path: indexPath});
      grunt.task.run('open:devperf_auto_task');
    }
  });


  // Executes the sequence (phantomas, then devperf)
  grunt.registerTask('devperf', 'Helps front-end developers to maintain a good quality, based on phantomas and grunt-phantomas.', function() {

    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      urls: [
        'http://www.google.fr'
      ],
      warnings: [],
      numberOfRuns: 5,
      timeout: 120,
      openResults: false,
      resultsFolder: './devperf'
    });

    var defaultWarnings = grunt.file.readJSON(__dirname + '/settings/desktop.json');

    // Merge user defined warnings with defaults
    defaultWarnings.forEach(function(defaultWarn) {
      var found = false;
      options.warnings.forEach(function(userWarn) {
        if (userWarn.variable === defaultWarn.variable) {
          found = true;
          if (userWarn.message === undefined) {
            userWarn.message = defaultWarn.message;
          } else if (userWarn.limit === undefined) {
            userWarn.limit = defaultWarn.limit;
          } else if (userWarn.message === undefined && userWarn.limit === undefined) {
            grunt.log.error('Warning ' + userWarn.variable + ' is misconfigured, it has been ignored.');
            userWarn.limit = -1;
            userWarn.message = "Ignored";
          }
        }
      });
      if (!found) {
        options.warnings.push(defaultWarn);
      }
    });

    // Inject the phantomas config into grunt config
    var phantomasConfig = {};
    options.urls.forEach(function(url) {
      phantomasConfig[sanitizeFolderName(url)] = {
        options: {
          indexPath: options.resultsFolder + '/' + sanitizeFolderName(url) + '/',
          url: url,
          numberOfRuns: options.numberOfRuns,
          options: {
            timeout: options.timeout
          }
        }
      };
    });
    grunt.config.set('phantomas', phantomasConfig);
    grunt.task.run('phantomas');

    // Inject the config into devperfAfter task
    grunt.config.set('devperfAfter', {options: options});
    grunt.task.run('devperfAfter');
  });
};

function sanitizeFolderName(path) {
  var folderName = path.replace(/[\/\.\?\:\-\&\%\=]/g, '');
  // Shorten name if it's too long
  if (folderName.length > 50) {
    folderName = folderName.substring(0, 50);
  }
  return folderName;
}
