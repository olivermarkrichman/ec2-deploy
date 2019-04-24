const ssh = require('ssh2');
const scpClient = require('scp2');
const gulp = require('gulp');
const fs = require('fs');
const fg = require('fast-glob');
const readline = require('readline');

let config = {
	host: '',
	username: '',
	password: '',
	remotePath: ''
}

let authorised = false;

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

const deployerTag = '\x1b[1m' + '[MD]' + '\x1b[0m' + ' ~ ';

function error(msg) {
	console.log(deployerTag + '\x1b[1m' + '\x1b[31m' + 'ERROR:' + msg, '\x1b[0m');
}

function warn(msg) {
	console.log(deployerTag + '\x1b[33m' + msg, '\x1b[0m');
}

function success(msg) {
	console.log(deployerTag + '\x1b[1m' + '\x1b[32m' + msg, '\x1b[0m');
}

function log(msg) {
	console.log(deployerTag + msg, '\x1b[0m')
}

exports.setConfig = function (userConfig) {
	if (!userConfig['host']) {
		error('Config is missing Host');
	}
	if (!userConfig['username']) {
		error('Config is missing Username');
	}
	if (!userConfig['password']) {
		error('Config is missing Password');
	}
	for (let key in userConfig) {
		if (!(key in config)) {
			warn(`Invalid key:'${key}' in Config`);
		} else {
			config[key] = userConfig[key];
		}
	}
	if (config.remotePath.substr(config.remotePath.length - 1) === '/') {
		config.remotePath = config.remotePath.substring(0, config.remotePath.length - 1);
	}
}

function checkPermissions(cb) {
	log(`Checking ${config.username} has the correct permissions on ${config.host} for ${config.remotePath} directory`);
	cmd('ls -ld ' + config.remotePath, data => {
		if (data.startsWith('drwxr')) {
			success(`${config.username} is authorised!`);
			cb();
		} else {
			error(`The configuration details you've set are incorrect, please change and try again`);
		}
	});
}

exports.getConfig = function () {
	return config;
}

exports.reload = function (directory) {
	refreshDirectory(directory);
}

function refreshDirectory(directory, cb) {
	let scpInfo = {
		host: config.host,
		username: config.username,
		password: config.password,
		path: config.remotePath
	};
	warn('Preparing to reload...');
	cmd('[ "$(ls -A ' + config.remotePath + ')" ] && echo 1 || echo 0', data => {
		if (Number(data)) {
			log('Removing contents of ' + config.remotePath);
			cmd('rm -rf ' + config.remotePath, data => {});
			cmd('mkdir ' + config.remotePath, data => {});
		}
	});
	setTimeout(() => {
		warn('Reloading...');
		var begin = Date.now();
		const dotFiles = fg.sync([directory + '**/.**']);
		let uploadedDotFiles = [];
		for (let file of dotFiles) {
			scpClient.scp(file, scpInfo, function (err) {
				if (err) {
					error(err);
				} else {
					uploadedDotFiles.push(file);
					done();
				}
			});
		}
		let dirUploaded = false;
		scpClient.scp(directory, scpInfo, function (err) {
			if (err) {
				error(err);
			} else {
				dirUploaded = true;
				done();
			}
		});
		const done = () => {
			if (dirUploaded && uploadedDotFiles.length === dotFiles.length) {
				var end = Date.now();
				var timeSpent = (end - begin) / 1000 + "secs";
				success('Reloaded in ' + timeSpent + '!');
				cb();
			}
		}
	}, 5000);
}

function watchAndDeploy(directory) {
	log(`Watching ${directory} for changes...`);
	gulp.watch(directory).on('all', function (event, path) {
		switch (event) {
		case 'add':
			uploadFile(path);
			break;
		case 'addDir':
			createFolder(path);
			break;
		case 'change':
			uploadFile(path);
			break;
		case 'unlink':
			deleteFile(path);
			break;
		case 'unlinkDir':
			deleteFolder(path);
			break;
		}
	});
}

function setRemoteDirectory(cb) {
	cmd('file ' + config.remotePath, data => {
		if (data.includes(config.remotePath + ': setgid directory')) {
			cb();
		} else if (data.includes(config.remotePath + ': cannot open (No such file or directory)')) {
			cmd('mkdir ' + config.remotePath, data => {});
			setRemoteDirectory();
		} else {
			cmd('rm -rf ' + config.remotePath, data => {});
			setRemoteDirectory();
		}
	});
}

exports.autoDeploy = function (directory, reload = false) {
	if (directory.substr(directory.length - 1) !== '/') {
		directory += '/';
	}
	checkPermissions(() => {
		// setRemoteDirectory(() => {
		if (reload) {
			log('\x1b[1m' + 'EXIT NOW IF YOU DO NOT WANT TO RELOAD ' + config.remotePath);
			rl.question(deployerTag + 'Press enter if you would like to continue.' + '\x1b[0m', (answer) => {
				if (!answer.length) {
					refreshDirectory(directory, function () {
						watchAndDeploy(directory);
					});
				} else {
					return;
				}
				rl.close();
			});
		} else {
			watchAndDeploy(directory);
		}
		// });
	});
}

function returnFileName(path) {
	return path.split('/')[path.split('/').length - 1];
}

function returnFilePath(path, dirPath = false) {
	let mainDir = path.split('/')[0];
	if (dirPath) {
		return path.split(mainDir)[1]
	} else {
		return path.split(mainDir)[1].replace(returnFileName(path), '');
	}
}

function uploadFile(path) {
	let fileName = returnFileName(path);
	let filePath = returnFilePath(path);
	log('Uploading ' + fileName + ' to ' + config.remotePath + filePath);
	scpClient.scp(path, {
		host: config.host,
		username: config.username,
		password: config.password,
		path: config.remotePath + filePath
	}, function (err) {
		if (err) {
			error(err);
		} else {

			success(`Uploaded ${fileName} to ${config.host} (${new Date().toLocaleTimeString()})`);
		}
	});
}

function createFolder(path) {
	let filePath = returnFilePath(path, true);
	log('Creating ' + filePath);
	cmd('mkdir ' + config.remotePath + filePath, data => {});
	cmd('test -d  ' + config.remotePath + filePath + ' && echo true || echo false', data => {
		if (data[0]) {
			success('Created ' + filePath);
		} else {
			error('Failed to create ' + filePath);
		}
	})
}

function deleteFile(path) {
	let fileName = returnFileName(path);
	let filePath = returnFilePath(path);
	log('Deleting ' + fileName);
	cmd('rm -rf ' + config.remotePath + filePath + fileName, data => {});
	cmd('test -f  ' + config.remotePath + filePath + fileName + ' && echo true || echo false', data => {
		if (!Number(data)) {
			success('Deleted ' + fileName);
		} else {
			error('Failed to delete ' + fileName);
		}
	});
}

function deleteFolder(path) {
	let filePath = returnFilePath(path, true);
	log('Deleting ' + filePath);
	cmd('rm -rf ' + config.remotePath + filePath, data => {});
	cmd('test -d  ' + config.remotePath + filePath + ' && echo true || echo false', data => {
		if (!data[0]) {
			success('Deleted ' + filePath);
		} else {
			error('Failed to delete ' + filePath);
		}
	})
}

function cmd(cmd, dataCB, showErr = true) {
	let conn = new ssh.Client();
	conn.on('ready', function () {
			conn.exec(cmd, function (err, stream) {
				if (err) throw err;
				stream.on('close', function (code, signal) { conn.end(); })
					.on('data', function (data) {
						dataCB(String(data));
					})
					.stderr.on('data', function (data) {
						if (showErr) { error(data); }
					});
			});
		})
		.connect({
			host: config.host,
			port: 22,
			username: config.username,
			password: config.password
		});
}