plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.suez.gateway"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.suez.gateway"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        val siteUrl = (project.findProperty("siteUrl") as String? ?: "").trim().trimEnd('/')
        buildConfigField("String", "SITE_URL", "\"$siteUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    buildFeatures {
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
