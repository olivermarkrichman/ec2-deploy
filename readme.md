# EC2-Deploy

This EC2-Deploy package makes it super easy to upload files to your AWS EC2 instance (or any SSH instance - only tested via AWS EC2). This package can accept a couple of simple commands which will then watch your directory and automatically send the files to the desired location on your server.

I created this as an easy way to deploy an API to EC2 as I wrote it, I couldn't see anything similar so here we are...


### Features:
* Checks that the user set in `setConfig()` is authorised to create/edit files in the chosen remote directory.
* Clears chosen remote directory  of files and upload files from your local directory on start so there are **no differences between live and local** (Optional).
* Uploads file on creation or change.
* Creates directories on the server on local creation.
* Deletes files/directories from server when deleted locally.

## Installation

[Package on NPM](https://www.npmjs.com/package/ec2-deploy)

```bash
$ npm install ec2-deploy
```

## Usage


```javascript
const deployer = require('ec2-deploy');

deployer.setConfig({
	host: 'my.server.ip.address', //IP Address of your server (IPv4 on EC2)
	username: 'my-user-name',
	password: 'top-secret-password',
	remotePath: '../../var/www/html' //The path from your user's root directory
                                     //where you want the files to go on the server
});

deployer.autoDeploy('api/', true);
//1st Param: local directory of where you want the deployer to watch and upload files from
//2nd Param: Set true if you want to refresh your server files when you run autoDeploy (Recommended)
```

Run this to auto deploy as you save changes (or add it to a package.json script):
```bash
$ node <FILE-WITH-CODE-ABOVE>.js
```

#### If you encounter an error report it [here](https://github.com/olivermarkrichman/ec2-deploy/issues/new)


##### Extra Details if you're using this to host a LAMP server with EC2:
1. [INSTALL LAMP ON EC2 LINUX 2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/install-LAMP.html)
2. [Create a user/password login for EC2 Instance](https://aws.amazon.com/premiumsupport/knowledge-center/ec2-password-login/)
3. Set User Permissions
4. If you need to edit the .htaccess then you need to edit the httpd.conf
5. Use this package and get coding!
