# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:
-keep class com.facebook.react.** { *; }
-keep class com.facebook.** { *; }
-dontwarn com.facebook.react.**

# Manter classes usadas por Hermes
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.hermes.**

# Configurações gerais para evitar erros
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**

# Manter nomes de classes e métodos para animações e bibliotecas externas
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Adicione outras regras específicas para bibliotecas externas, como:
# - react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-dontwarn com.swmansion.reanimated.**   
# - react-native-vector-icons
-keep class com.oblador.vectoricons.** { *; }
-dontwarn com.oblador.vectoricons.**