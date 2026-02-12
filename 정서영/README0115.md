# 2026.01.15. 오늘 한 일 
'싸비스' 기획에 대해 DB를 설계하고 ERD 를 구성하였다.
### Device (기기 정보 테이블)
### AppSetting (환경 설정 테이블)
### UserProfile (사용자 테이블)
### BiometricFeature(사용자 생체 정보 테이블) 

- 추가되어야 할 내용
ERD의 구체화

----
# Kotlin 공부 

## 기본 문법

- `val` / `var` (불변 / 가변)
- 함수 선언 (`fun`)
- 조건문: `if`, `when`
- 반복문: `for`, `while`
- **Null Safety**
    - `?` (nullable)
    - `!!` (강제 언래핑)
    - `?:` (엘비스 연산자)
- `data class`
- 컬렉션
    - `List`, `Set`, `Map`
- 예제 코드

```jsx
fun sum(a: Int, b: Int): Int {
    return a + b
}

val name: String? = null
println(name ?: "이름 없음")
```

- 포인트: Kotlin의 가장 큰 장점은 Null Safety

## 객체지향 & Kotlin 전용 문법

### 주요 개념

- `class`, `constructor`
- 상속 (`:`)
- `interface`
- `object` (싱글톤)
- `enum class`
- `sealed class`
- `companion object`

- 예제 코드

```jsx
data class User(
    val id: Int,
    val name: String
)
```

## Kotlin스럽게 쓰기

### 핵심 문법

- 람다식 `{ }`
- 고차 함수
    - `map`, `filter`, `forEach`
- 확장 함수
- 스코프 함수
    - `let`
    - `run`
    - `apply`
    - `also`
    - `with`

- 예제 코드

```jsx
user?.let {
    println(it.name)
}
```

## 코루틴 (비동기 처리 핵심)

### 핵심 개념

- `suspend`
- `CoroutineScope`
- `launch`
- `async / await`
- `withContext`
- `Dispatchers`

- 예제 코드

```jsx
launch {
    val data = async { loadData() }.await()
    println(data)
}
```

## 학습 루트 (안드로이드 개발 목적)

1. Kotlin 기본 문법
2. Android Studio
3. Activity / Fragment
4. ViewBinding / Jetpack
5. MVVM 패턴
6. Coroutine + Flow


# 안드로이드 스튜디오 실행

## 프로젝트 구조

- [app] 폴더 구조 정리
    - [manifest] 폴더
        - AndroidManifest.xml 파일 하나로 구성됨
        - 앱과 관련된 기본적인 설정이 담겨 있음
        - 앱의 패키지 이름, 앱 구성요소(액티비티, 서비스, 콘텐츠 제공자, 브로드캐스트 리시버), 권한 정의
        - 기본 생성된 메인 액티비티가 정의되어 있음. 이때 액티비티란 눈에 보이는 화면이라고 생각하면 됨
    - [java] 폴더
        - 자바 파일과 코틀린 파일이 들어있음. 앱의 로직을 담당하는 부분
        - MainAcitivity.kt - 메인 액티비티의 동작을 정의한 코드. 대부분의 시간을 여기서 보내게 될 예정
    - [res] 폴더
        - 앱에서 사용하는 이미지, 레이아웃, 색상 값과 같은 자원을 모아놓은 곳
        - [drawable] 폴더: 앱에서 사용할 이미지 파일
        - [layout] 폴더: 액티비티나 프래그먼트와 같이 화면에 보여줄 구성요소들의 레이아웃을 XML 파일로 정의해놓음
        - [mipmap] 폴더: 런처에 등록할 이미지를 놓음. (런처: 앱을 실행할 때 누르는 아이콘)
        - [values] 폴더: 색상이나 문자열과 같은 값들을 지정해놓음


Gradle Scripts

- Gradle이란: 소스 코드를 앱으로 만들어 실행하기 위해 소스 코드를 컴파일하고 apk 파일로 패키징하는 빌드 과정을 거치는 작업을 함 ( = 빌드시스템)
- [Gradle Scripts] 폴더에는 빌드에 사용할 파일들이 들어있음 (특별한 뭔가 하지 않으면 프로젝트가 생성될 때 생성된 그대로 사용해도 빌드됨, 외부 라이브러리 추가하고 싶으면 이 파일 수정하기)
- 주로 build.gradle(Project: HelloWorld)와 build.gradle(Module: HelloWorld.app) 을 주로 수정함

- App - Main - MainActivity

```jsx
package com.example.helloworld

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
    }
}
```

- App - res - layout - activity_main.xml

```jsx
<?xml version="1.0" encoding="utf-8"?>
<androidx.constraintlayout.widget.ConstraintLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    tools:context=".MainActivity">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="안녕 세상아!!!!!"
        app:layout_constraintBottom_toBottomOf="parent"
        app:layout_constraintLeft_toLeftOf="parent"
        app:layout_constraintRight_toRightOf="parent"
        app:layout_constraintTop_toTopOf="parent"
        app:layout_constraintVertical_bias="0.0" />

</androidx.constraintlayout.widget.ConstraintLayout>
```

- App - manifests - AndroidManifest.xml

```jsx
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.helloworld">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.HelloWorld">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />

                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
```

- 상단 RUN 버튼을 누르면 실제 안드로이드 폰으로 실행하는 것처럼 시뮬레이션 가능

# Kotlin 문법 정리

### Kotlin 시작하기

- File → Projects → New Projects → No Activity → 기본언어 Kotlin → 최소 SDK API 26 지정
- File → New → Scratch → Kotlin
- Android → Scratches and Consoles → scratch.kts

## 변수와 상수

- val: 상수
    - `val pi : Double = 3.14`  val 변수명 : 자료형(생략가능) = 값
    - `val name = 'gil-dong'`
    - `val pi = 3.14` → 정상 작동 `pi = 3.141592` → 오류 발생
- var: 변수
    - `var age = 21`
    - `age = 25` → age 재할당 가능
    

![image.png](attachment:3c9aa11f-2808-41e5-a82b-c1bfc7f2bc67:image.png)

- Byte → Short (2 Byte) → Int (4 Byte) → Long (8 Byte)
- 실수의 경우 자료형을 명시하지 않으면 기본값 Double.
- float 으로 지정하고 싶다면 값 뒤에 f 추가 (`val numFloat : Float = 3.2f`)

### 문자 자료형

- Char 형 (문자 하나)
    - `val char1 : Char = 'H'`
- String 형 (문자열)
    - `val string1 : String = "Hi, This is String"`

### 논리 자료형

- `val isTrue : Boolean = True`

### 배열 자료형

- Array
    - `val stringArray : Array<String> = arrayOf("apple", "banana", "grape")`
    - `val intArray = arrayOf(1,2,3)` 자료형 생략 가능

### 명시적 형변환

- 변환될 자료형을 직접 지정하는 것
    
    ```kotlin
    val score = 100
    val scoreString = score.toString()
    val scoreDouble = score.toDouble()
    ```
    

## 함수

```kotlin
fun 함수명 (매개변수) : 반환 자료형 {
 // 실행할 코드 내용
}

// 함수 기본 예시
fun printAge(age : Int) : Unit {
	println(age)
}
printAge(15) // 15

// Unit 생략 가능 
fun printAge(age : Int) {
    println(age)
}
printAge(10) // 10

// 반환값이 있는 함수
fun addNum(a : Int, b:Int) : Int{
    return a + b
}
println(addNum(200,400)) // 600. 반환값이 int 이므로 반드시 명시해주어야 함

// 반환형 명시해주지 않아도 형추론으로 반환함
fun minusNum(a:Int, b:Int) = a-b
println(minusNum(minusNum(1000,200),100)) // 700
```

## 문자열 템플릿

```kotlin
val price = 3000
val tax = 300

val originalPrice = "The original price is $price" // 파이썬 f-string 느낌 
val totalPrice = "The total price is ${price + tax}"
```

## 제어문

- for, while, if, when
- 범위 클래스 (IntRange, LongRange, CharRange 등)

```kotlin
val numRange: IntRange = 1..5

println(numRange.contains(3)) // true. 1과 5 사이에 있음 
println(numRange.contains(10)) // false. 1과 5 사이에 있지 않음

val charRange : CharRange = 'a'..'e'

println(charRange.contains('b')) // true.
println(charRange.contains('z')) // false.
```

- for 문

```kotlin
for(i in 1..5) {
    println(i)
} // 1,2,3,4,5

for(i in 5 downTo 1) {
    println(i)
} // 5,4,3,2,1

for(i in 1..10 step 2){
    println(i)
} // 1,3,5,7,9

val students = arrayOf("jun-gi", "jun-su", "si-u", "yeon-seo", "jun-seo")

for(name in students) {
    println(name)
} // jun-gi, jun-su, si-u, yeon-seo, jun-seo

val students = arrayOf("jun-gi", "jun-su", "si-u", "yeon-seo", "jun-seo")

for((index, name) in students.withIndex()) {
    println("Index : $index Name : $name")
}
// Index : 0 Name : jun-gi
// Index : 1 Name : jun-su
// Index : 2 Name : si-u
// Index : 3 Name : yeon-seo
// Index : 4 Name : jun-seo
```

- while 문

```kotlin
var num = 1

while(num < 5) {
    println(num)
    num++
} // 1,2,3,4

var num = 1

do {
    num++
    println(num)
} while (num<5) // 2,3,4,5
```

- if 문

```kotlin
var examScore = 60
var isPass = false

if(examScore > 80){
    isPass = true
}

println("시험결과: $isPass") // 시험결과: false

val examScore = 99
if(examScore == 100) {
    println("만점이네요.")
} else{
    println("만점은 아니에요.")
} // 만점은 아니에요.

val myAge = 40
val isAdult = if(myAge > 30) true else false

println("성인 여부: $isAdult") // 성인여부: true
```

- when 문

```kotlin
val weather = 15
when(weather) {
    -20 -> {println("매우 추운 날씨")} // 값 하나
    11,12,13,14 -> {println("쌀쌀한 날씨")} // 값 여러 개
    in 15..26 -> {println("활동하기 좋은 날씨")} // 범위 안에 들어가는 경우
    !in -30..50 -> {println("잘못된 값입니다 -30~50 가운데 값을 적어주세요.")} // 범위 안에 들어가지 않는 경우
    else -> {println("잘 모르겠는 값")} // 위 경우가 모두 아닐 때
}

val essayScore = 95
val grade = when(essayScore){
    in 0..40 -> "D"
    in 41..70 -> "C"
    in 71..90 -> "B"
    else -> "A"
}
println("에세이 학점: $grade") // A
```

## 컬렉션

- 리스트 (List) - 순서가 있는 자료구조
    - 읽기전용리스트 → listOf()
    
    ```kotlin
    val numImmutableList = listOf(1,2,3)
    numImmutableList[0] = 1 // 오류 발생 -> 읽기 전용이므로 
    ```
    
    - 읽기쓰기 모두 가능한 리스트 → mutableListOf()
    
    ```kotlin
    val numMutableList = mutableListOf(1,2,3)
    numMutableList[0] = 100 // 첫 번째 요소를 1에서 100으로 변환
    
    println(numMutableList) // [100,2,3]
    println(numMutableList[0]) // 100
    ```
    
    - 리스트에 있는 요소 확인 → contains()
    
    ```kotlin
    println(numMutableList.contains(1)) // false
    println(numMutableList.contains(2)) // true
    ```
    

## 클래스

- `class Car` → 아무 기능도 없지만 돌아가긴 함
- `class Car(val color : string)` → 읽기 전용 프로퍼티 (프로퍼티: 클래스의 속성)

```kotlin
val car = Car("red") // 객체 생성
println("My car color is ${car.color}") // 객체의 color 프로퍼티 사용
```

- 주 생성자 
```kotlin
class Person constructor(name : String) {} 

// 키워드 constructor 생략 가능
class Person(name : String) {}

// var 와 val 을 이용하면 프로퍼티 선언과 초기화를 한 번에 가능
class Person(val name : String) {}
```

- 보조 생성자 - 클래스 바디 내부에서 constructor 키워드를 이용해 만듦

```kotlin
class Person {
	constructor(age : Int) {
		println("'I'm $age years old")
	}
}

// 주 생성자가 존재할 때는 반드시 this 키워드를 통해 주 생성자를 호출해야 함
class Person(name : String) {
    constructor(name : String, age : Int) : this(name) {
        println("I'm $age years old")
    }
}
```

- 초기화 블록 - 객체 생성 시 필요한 작업을 함 (init{} 안의 코드들은 객체 생성 시 가장 먼저 실행되고 주 생성자의 매개변수를 사용할 수 있음)

```kotlin
class Person(name : String) {
    val name : String
    init {
        if (name.isEmpty()) { // 문자열이 비어있는 경우 에러 발생
            throw IllegalArgumentException("이름이 없어요.")
        }
        this.name = name // 문자열이 안 비어 있으면 이름 저장
    }
}

val newPerson = Person("") // 에러 발생 
// java.lang.IllegalArgumentException: 이름이 없어요.
// at Scratch$Person.<init>(scratch.kts:5)
// at Scratch.<init>(scratch.kts:11)

val newPerson = Person("yeon-seo") // 객체 생성 성공
```

- 클래스의 상속 - open ( 자식 클래스에서 오버라이드 하기 위해, : (콜론) 으로 상속 나타냄 )