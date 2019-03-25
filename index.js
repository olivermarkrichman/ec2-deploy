const ssh = require('ssh2');
const scpClient = require('scp2');
const gulp = require('gulp');
const fs = require('fs');
let config = {
	host: '',
	username: '',
	password: '',
	remotePath: ''
}

let reloadWaitTime = 15000;

const deployerTag = '\x1b[106m' + '\x1b[30m' + '[Mezaria-Deployer]' + '\x1b[0m' + ' ~ ';

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
	checkPermissions();
}

function checkPermissions() {
	log(`Checking ${config.username} has the correct permissions on ${config.host} for ${config.remotePath} directory`)
	fs.writeFile(
		'permission-check.txt',
		`This file is used by Mezaria's EC2-Deploy Package to check if you can upload files using the config details provided. Feel free to delete this file.`,
		(err) => {
			if (!err) {
				scpClient.scp('./permission-check.txt', {
					host: config.host,
					username: config.username,
					password: config.password,
					path: config.remotePath
				}, function (err) {
					if (err) {
						error(`The configuration details you've set are incorrect, please change and try again`);
					} else {
						cmd('rm -rf ' + config.remotePath + '/permission-check.txt', () => {}); //Remove Perm-chk file from server.
						fs.unlink('permission-check.txt', (err) => { if (err) { error(err); } }); //Remove local Perm-chk file.
						success(`${config.username} is authorised!`);
					}
				});
			} else {
				error(err);
			}
		}
	)
}

exports.getConfig = function () {
	return config;
}

exports.reload = function (directory) {
	refreshDirectory(directory);
}

function refreshDirectory(directory, cb) {
	warn('Preparing to refresh ' + config.remotePath + ' with contents of ' + directory);
	cmd('rm -rf ' + config.remotePath + '/*', data => {});
	cmd('[ "$(ls -A ' + config.remotePath + ')" ] && echo 1 || echo 0', data => {
		if (!Number(data)) {
			log('Removed existing files in ' + config.remotePath);
			scpClient.scp(directory, {
				host: config.host,
				username: config.username,
				password: config.password,
				path: config.remotePath
			}, function (err) {
				if (err) {
					error(err);
				} else {
					success(`Reloaded ${directory} in ${config.remotePath}`);
					cb();
				}
			});
		} else {
			error('Failed to remove existing files on ' + config.remotePath);
		}
	});
}

exports.autoDeploy = function (directory, reload = false) {
	if (directory.substr(directory.length - 1) !== '/') {
		directory += '/';
	}

	const watchAndDeploy = (directory) => {
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
	};

	setTimeout(function () {
		if (reload) {
			warn(`You've set 'reload' to true in your autoDeploy() call. If you did not want to do this then exit now. Otherwise please wait.`);
			log('\x1b[1m' + 'EXIT NOW IF YOU DO NOT WANT TO UPLOAD THE CONTENTS OF: ' + directory);
			setTimeout(function () {
				refreshDirectory(directory, function () {
					watchAndDeploy(directory);
				});


			}, reloadWaitTime);
		} else {
			watchAndDeploy(directory);
		}
	}, 2500);
}

function returnFileName(path) {
	return path.split('/')[path.split('/').length - 1];
}

function returnFilePath(path, dirPath = false) {
	if (dirPath) {
		return path.split('api')[1]
	} else {
		return path.split('api')[1].replace(returnFileName(path), '');
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
	let filePath = path.split('api')[1].replace(returnFileName(path), '');
	log('Deleting ' + fileName);
	cmd('rm -rf ' + config.remotePath + filePath + fileName, data => {});
	cmd('test -f  ' + config.remotePath + filePath + fileName + ' && echo true || echo false', data => {
		if (!data[0]) {
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

function cmd(cmd, dataCB) {
	let conn = new ssh.Client();
	conn.on('ready', function () {
			conn.exec(cmd, function (err, stream) {
				if (err) throw err;
				stream.on('close', function (code, signal) { conn.end(); })
					.on('data', function (data) {
						// 	dataCB(String(data).split(/\r?\n/));
						dataCB(String(data));
					})
					.stderr.on('data', function (data) {
						error(data);
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