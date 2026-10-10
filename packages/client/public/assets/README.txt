Ассеты игры.

audio/manifest.json  — список звуков, петель окружения и музыки по настроениям.
audio/sfx, audio/loops, audio/music — файлы Ogg Vorbis. Источники и лицензии: audio/LICENSES.txt.
sprites/micro-roguelike.png — спрайты для фона меню. Лицензия: sprites/LICENSES.txt.

Чтобы заменить звук, положите свой .ogg и поправьте пути в audio/manifest.json.
Если файла нет, игра использует встроенный синтез.
Пересобрать звуки из исходных наборов: tools/assets/import-audio.mjs.
