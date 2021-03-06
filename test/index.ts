import { createClient } from 'matrix-js-sdk'
import { WebStorageSessionStore } from 'matrix-js-sdk/src/store/session/webstorage'

new WebStorageSessionStore({}).getAllEndToEndDevices()
const client = createClient({
    baseUrl: 'https://matrix.org',
    accessToken: '....MDAxM2lkZW50aWZpZXIga2V5CjAwMTBjaWQgZ2Vu....',
    userId: '@USERID:matrix.org',
})
client.login('m.login.password', { user: 'USERID', password: 'hunter2' }).then((response) => {
    console.log(response.access_token)
})
console.log(client.getAccessToken())
client.startClient({})
client.once('sync', function (state, _prevState, _res) {
    console.log(state) // state will be 'PREPARED' when the client is ready to use
})
client.on('event', function (event) {
    console.log(event.getType())
    console.log(event)
})
client.on('Room.timeline', function (event, _room, _toStartOfTimeline) {
    console.log(event.event)
})
// client.client.getRooms() returns an array of room objects
var rooms = client.getRooms()
rooms.forEach((room) => {
    console.log(room.roomId)
})
rooms.forEach((room) => {
    var members = room.getJoinedMembers()
    members.forEach((member) => {
        console.log(member.name)
    })
})
rooms.forEach((room) => {
    room.timeline.forEach((t) => {
        console.log(JSON.stringify(t.event.content))
    })
})
var testRoomId = '!jhpZBTbckszblMYjMK:matrix.org'

var content = {
    body: 'Hello World',
    msgtype: 'm.text',
}

client
    .sendEvent(testRoomId, 'm.room.message', content, '')
    .then((_res) => {
        // message sent successfully
    })
    .catch((err) => {
        console.log(err)
    })
client.on('Room.timeline', function (event, _room, _toStartOfTimeline) {
    // we know we only want to respond to messages
    if (event.getType() !== 'm.room.message') {
        return
    }

    // we are only intested in messages from the test room, which start with "!"
    if (event.getRoomId() === testRoomId && event.getContent().body[0] === '!') {
        sendNotice(event.event.content.body)
    }
})

function sendNotice(body: string) {
    var content = {
        body: body.substring(1),
        msgtype: 'm.notice',
    }
    client.sendEvent(testRoomId, 'm.room.message', content, '', (err, _res) => {
        console.log(err)
    })
}
