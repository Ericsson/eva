# -*- coding: utf-8 -*-
# Generated by Django 1.11 on 2018-09-20 13:27
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('annotator', '0026_auto_20180831_1236'),
    ]

    operations = [
        migrations.AddField(
            model_name='uploadfile',
            name='file_type',
            field=models.CharField(choices=[('image', 'Image'), ('video', 'Video')], default='image', max_length=5),
        ),
    ]