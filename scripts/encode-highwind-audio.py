"""Encode the browser-rendered MIDI WAV using an installed LAME library."""
import argparse, ctypes as c, hashlib, json, pathlib, wave

parser = argparse.ArgumentParser()
parser.add_argument('wave')
parser.add_argument('--lame', default='C:/Program Files/Audacity/libmp3lame.dll')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
source = root / args.wave
destination = root / 'dist/data/highwind/highwind-takes-to-the-skies.mp3'
with wave.open(str(source), 'rb') as wav:
    assert wav.getnchannels() == 2 and wav.getsampwidth() == 2
    rate, frames = wav.getframerate(), wav.getnframes()
    pcm = wav.readframes(frames)
lib = c.CDLL(args.lame)
lib.lame_init.restype = c.c_void_p
encoder = lib.lame_init()
assert encoder
for name, value in [('lame_set_in_samplerate', rate), ('lame_set_num_channels', 2), ('lame_set_brate', 128), ('lame_set_quality', 2)]:
    fn = getattr(lib, name)
    fn.argtypes = [c.c_void_p, c.c_int]
    assert fn(encoder, value) == 0
lib.lame_init_params.argtypes = [c.c_void_p]
assert lib.lame_init_params(encoder) == 0
lib.lame_encode_buffer_interleaved.argtypes = [c.c_void_p, c.POINTER(c.c_short), c.c_int, c.POINTER(c.c_ubyte), c.c_int]
lib.lame_encode_flush.argtypes = [c.c_void_p, c.POINTER(c.c_ubyte), c.c_int]
lib.lame_close.argtypes = [c.c_void_p]
output = bytearray()
buffer = (c.c_ubyte * 20000)()
try:
    for at in range(0, len(pcm), 4096*4):
        chunk = pcm[at:at+4096*4]
        samples = (c.c_short * (len(chunk)//2)).from_buffer_copy(chunk)
        size = lib.lame_encode_buffer_interleaved(encoder, samples, len(chunk)//4, buffer, len(buffer))
        assert size >= 0
        output.extend(buffer[:size])
    size = lib.lame_encode_flush(encoder, buffer, len(buffer))
    assert size >= 0
    output.extend(buffer[:size])
finally:
    lib.lame_close(encoder)
destination.write_bytes(output)
metadata = {'file': destination.name, 'notes': 5150, 'durationSeconds': frames/rate, 'sampleRate': rate,
            'source': 'highwind-takes-to-the-skies.mid', 'sourceSha256': hashlib.sha256((root/'assets/highwind-takes-to-the-skies.mid').read_bytes()).hexdigest(),
            'render': 'Web Audio OfflineAudioContext, original MIDI tempo/programs, stereo, LAME 128 kbps',
            'sha256': hashlib.sha256(output).hexdigest(), 'bytes': len(output)}
(destination.parent/'audio.json').write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
print(json.dumps(metadata))
