# Project 0aam
#### algorythm name ulda0

## Files tructure

MasterFile structre 
> Main file to gide through 
``` json
MasterFile: {
    signatures:{
        1:"base64", ... 
    },
    files: {
        id:{
            index: location,
            key: encryption key for the files,
            descryption: optional (might be used for nameing)
        }, ...
    }
}
```

ContentFile structre
> guided file with users content
``` json
ContentFile: {
    sygnatures: {
        1: base64, ...
    },
    content: {
        // file content
        header: text,
        // something else
        file: ...
    }
}
```

## Once class is created

1. **connect to server** (socketIO)
2. **pulse** (use ping-pong connection every 1-3 sec to keep connection alive)
3. *Optiocal* - directly download MasterFile*
4. *Optiocal* - use different encryption liberaries*

### Delivery protocol

File up/download must be created as a function (in order to create socketio or https or ssh* conntion)

# How it might work

#### Assabmble connection 
> How it should be started on clients side
``` js
const u = ulda0(args*)
```

#### Register Master File
> Creates the master file on the server by password and returns 
```js 
u.RegisterMaster(password_for_the_cabinet).*then((responce) =>
    {
        id: id as file location (mandatory, optionaly by value like email*)
        res:{
            status:true/false,
            error:null*
        },
        file: newborn file* (save to local value directly)
    }
)
```

#### Get file on request
>Donwload file once user wqants to login
``` js
u.GetFile(FileID*, Password).*then(() => {
    file: file content itself,
    res:{
        status:true/false,
        error:null*
    }
    // set u.Master : file content list
    // also loads all content files**
})
```

#### Master file as a varable
>Returs content of the file 
>Provides indexes and keys 
``` js
u.Master (as a valriable) => MasterFile.files
```
>As an idea *update json directly*
>https://chatgpt.com/share/671634dc-976c-8001-809c-87dc324db581
#### Forced sycronisation
> Make shure that file is updated
```js
u.connect.FileIndex : {file content}
```

#### Add content file
> just to add the file and make sure that it is updated
> Required to update Master file
```js
u.CreateContent(json_content).then(() =>{
    index: fileIndex,
    res:{
        status:true/false,
        error:null*
    }
})
```

#### Update file after changes were made
> Just load object and get responce that it is done 
```js
u.updateContent(index, json_content_new).then(() => {
    res:{
        status:true/false,
        error:null*
    }
    //update all u.connect
})
```
As an idea *update json directly*
https://chatgpt.com/share/671634dc-976c-8001-809c-87dc324db581

#### Delete file and make sure it is gone
>Delete and update Master File
```js
u.DeleteContent(index).then(() => {
    res:{
        status:true/false,
        error:null*
    }
    //update MasterFile
})
``` 

#### Kill connetion and delete all information 
> it is like to refresh the page
```js
u.die().then
```

#### Change password at Master File
> Recrypt full file and make sure it is changed
```js
u.MasterPassChange(old_password,new_password).*then((responce) =>
    {
        res:{
            status:true/false,
            error:null*
        },
    }
)
```

## Aditional Methods
> the needed to be updated  

#### Make Ping-Pong  
>To keep connection alive
>> if needed and make sence
```js
u.pulse(latency => {})
```


## Cryptography methods 
> They need to be changed ...

```js
generateSignatures(signatureCount)      // generates signatues by count of signatureCount
createMasterFileSignatures()            // just creates all the signatures
StepUpSignaturesUpdate()                // makes update of n+1 istteration
generateLinkedHashes(line)  TODO        // generates 5 hashed line of signatures
hashSHA256(data)                        // currently used for hashSHA256
validateHashChain(oldHashes, newHashes) // validate is the signatures inherits the line
                                        // works only at n => n+1, needs to be changed
encryptFile(MasterFile, password, salt, iv, iterations, pbkdf2Salt)
                                        // encryptor for MasterFile
decryptFile(MasterFileEncrypted, password)
                                        // decryptor for MasterFile
encryptContentFile(fileData, password, iv)
										// encryptor for ContentFile
decryptContentFile(encryptedFile, password)
                                        // decryptor for ContentFile

```
  
### TODO refactor functions
$$generateSignatures()$$
$$createMasterFileSignatures()$$
$$StepUpSignaturesUpdate()$$
  

## Pseudo code solutions

```js
u.RegisterMaster(password_for_the_cabinet).then((responce) =>{
	>Create json structure
	>call and save createMasterFileSignatures()
	>sign file via generateLinkedHashes(line)
		**if !id (from settings) => id=hash(password)
	>Ecnrypt file via encryptFile(args)
	>Send to server
	>server side {
		>Save file and singed_line to DB
		>get id from DB
		>return status and id
	}
	>return{
		status,
		ID,
		file itself to local constant	
	}

}) 
```